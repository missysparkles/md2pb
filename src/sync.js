const fs = require("fs");
const { promisify } = require("util");

const { v4: uuidv4 } = require("uuid");
const MFA = require("mangadex-full-api");

const MANGADEX_SOURCE_ID = "MangaDex";
const MD_CACHE = ".md_cache";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

function toSwiftDate(d) {
  //  bullshit
  return (d.getTime() - Date.UTC(2001, 0, 1)) / 1000.0;
}

// hackin it to fix bugs and make it more efficient
MFA.Manga.getReadChapters = async (...ids) => {
  const AuthUtil = require("mangadex-full-api/src/auth");
  const Util = require("mangadex-full-api/src/util");
  const APIRequestError = require("mangadex-full-api/src/internal/requesterror");
  if (ids.length === 0) throw new Error("Invalid Argument(s)");
  if (ids[0] instanceof Array) ids = ids[0];
  await AuthUtil.validateTokens();
  let chapterIds = await Util.apiParameterRequest(`/manga/read`, { ids: ids });
  if (!(chapterIds.data instanceof Array))
    throw new APIRequestError(
      "The API did not respond with an array when it was expected to",
      APIRequestError.INVALID_RESPONSE
    );
  return Util.getMultipleIds(
    (params) => MFA.Chapter.search(params, true),
    chapterIds.data
  );
};

// just want the total as a rough estimate
MFA.Manga.getFeedCount = async (id, parameterObject = {}) => {
  const Util = require("mangadex-full-api/src/util");
  const APIRequestError = require("mangadex-full-api/src/internal/requesterror");
  const resp = await Util.apiParameterRequest(
    `/manga/${id}/feed`,
    parameterObject
  );
  if (!(resp.data instanceof Array) || typeof resp.total !== "number") {
    throw new APIRequestError(
      `The API did not respond the correct structure for a search request:\n${resp}`,
      APIRequestError.INVALID_RESPONSE
    );
  }
  return resp.total;
};

function validateBackup(backup) {
  if (backup.backupSchemaVersion !== 3) {
    throw Error("Backup schema version too old.");
  }
  // put the arrays in place if they don't exist
  [
    "library",
    "sourceMangas",
    "chapterMarkers",
    "tabs",
    "sourceRepositories",
    "activeSources",
  ].forEach((k) => {
    backup[k] = backup[k] || [];
  });
}

function addRepositoryAndSource(backup) {
  const existingRepo = backup.sourceRepositories.find(
    (sr) =>
      sr.url === "https://paperback-ios.github.io/extensions-sources/primary"
  );
  if (!existingRepo) {
    backup.sourceRepositories.push({
      name: "Extensions Primary",
      url: "https://paperback-ios.github.io/extensions-sources/primary",
      type: 0,
    });
  }
  const existingSource = backup.activeSources.find(
    (s) => s.id === MANGADEX_SOURCE_ID
  );
  if (!existingSource) {
    backup.activeSources.push({
      author: "nar1n",
      desc: "Extension that pulls manga from MangaDex",
      website: "https://github.com/nar1n",
      id: "MangaDex",
      tags: [
        { type: "default", text: "Recommended" },
        { type: "success", text: "Notifications" },
      ],
      contentRating: "EVERYONE",
      websiteBaseURL: "https://mangadex.org",
      repo: "https://paperback-ios.github.io/extensions-sources/primary",
      version: "2.1.2",
      icon: "icon.png",
      name: "MangaDex",
    });
  }
}

function createTabMapping(backup, statuses) {
  const tabMap = new Map();

  for (const slug of statuses) {
    const name = slug
      .split("_")
      .map((s) => `${s[0].toUpperCase()}${s.slice(1)}`)
      .join(" ");
    let tab = backup.tabs.find((t) => t.name === name);
    if (!tab) {
      tab = {
        id: uuidv4(),
        name,
        sortOrder: backup.tabs.length,
      };
      backup.tabs.push(tab);
    }
    tabMap.set(slug, tab);
  }

  return tabMap;
}

async function createMangaInfo(manga) {
  let status = "Unknown";
  switch (manga.status) {
    case "ongoing":
      status = "Ongoing";
      break;
    case "completed":
      status = "Completed";
      break;
    case "hiatus":
      status = "Hiatus";
      break;
    case "cancelled":
    default:
    // unhandled
  }

  return {
    id: uuidv4(),
    rating: 5, // https://github.com/Paperback-iOS/extensions-sources/blob/primary/src/MangaDex/MangaDex.ts#L256
    covers: [],
    author: (await MFA.resolveArray(manga.authors))
      .map((a) => a.name)
      .join(", "),
    // https://github.com/Paperback-iOS/extensions-sources/blob/primary/src/MangaDex/MangaDex.ts#L230
    tags: [
      {
        id: "tags",
        label: "Tags",
        tags: manga.tags.map((t) => ({ id: t.id, value: t.name })),
      },
    ],
    // https://github.com/Paperback-iOS/extensions-sources/blob/primary/src/MangaDex/MangaDex.ts#L223
    desc: manga.description.replace(/\[\/{0,1}[bus]\]/g, ""),
    titles: [manga.title, ...manga.altTitles],
    image: (await manga.mainCover.resolve()).imageSource,
    additionalInfo: {
      langFlag: "",
      users: "",
      langName: "",
      avgRating: "",
      views: "",
      follows: "",
    },
    hentai: ["erotica", "pornographic"].includes(manga.contentRating),
    artist: (await MFA.resolveArray(manga.artists))
      .map((a) => a.name)
      .join(", "),
    status,
  };
}

exports.sync = async function sync(username, password, filename) {
  let backup = {
    backupSchemaVersion: 3,
    date: toSwiftDate(new Date()),
    version: "v0.6.0-r2.0.9",
  };
  let file;
  try {
    file = await readFile(filename);
  } catch (e) {
    // missing file
  }

  if (file) {
    await writeFile(`${filename}.bk`, file);
    try {
      backup = JSON.parse(file);
    } catch (e) {
      console.log(
        "could not parse existing backup file, going to overwrite it"
      );
    }
  }

  validateBackup(backup);
  addRepositoryAndSource(backup);

  await MFA.login(username, password, MD_CACHE);

  // get all manga ids and reading statuses from MD
  const statuses = await MFA.Manga.getAllReadingStatuses();

  // create missing tabs if they don't exist
  const tabMap = createTabMapping(backup, new Set(Object.values(statuses)));

  for (const [id, status] of Object.entries(statuses)) {
    const sourceManga = backup.sourceMangas.find((sm) => sm.mangaId === id);
    // if manga is completely new, create the source manga
    if (!sourceManga) {
      try {
        // get manga with resolved details
        const manga = await MFA.Manga.get(id, true);
        const mangaInfo = await createMangaInfo(manga);
        backup.sourceMangas.push({
          mangaId: id,
          id: `$${MANGADEX_SOURCE_ID}&${id}`,
          manga: mangaInfo,
          originalInfo: mangaInfo,
          sourceId: MANGADEX_SOURCE_ID,
        });
      } catch (e) {
        console.error(`unable to create source manga for ${id}: ${e.message}`);
      }
    }

    // get all read chapters now
    let chapters = [];
    try {
      if (status !== "completed") {
        chapters = await MFA.Manga.getReadChapters(id);
      } else {
        // since completed series become 'unread' grab the whole feed
        const params = { translatedLanguage: ["en"], limit: 500, offset: 0 };
        let batch = await MFA.Manga.getFeed(id, params, true);
        while (batch.length > 0) {
          params.offset += batch.length;
          chapters.push(...batch);
          batch = await MFA.Manga.getFeed(id, params, true);
        }
      }
    } catch (e) {
      console.error(`error fetching chapters for ${id}: ${e.message}`);
      chapters = [];
    }

    // create all chapter markers if not exists
    for (const chapter of chapters) {
      let idx = 0;
      const existingChapter = backup.chapterMarkers.find(
        (chm) =>
          chm.chapter.id === chapter.id &&
          chm.chapter.mangaId === id &&
          chm.chapter.sourceId == MANGADEX_SOURCE_ID
      );
      if (!existingChapter) {
        try {
          const time = toSwiftDate(chapter.createdAt);
          const chm = {
            chapter: {
              chapNum: +chapter.chapter || -2,
              mangaId: id,
              volume: +chapter.volume || -2,
              id: chapter.id,
              time,
              sortingIndex: idx--,
              sourceId: MANGADEX_SOURCE_ID,
              group: (await MFA.resolveArray(chapter.groups))
                .map((g) => g.name)
                .join(", "),
              langCode: chapter.translatedLanguage === "en" ? "gb" : "_unknown",
              name: chapter.title || "",
            },
            lastPage: chapter.pageNames.length,
            totalPages: chapter.pageNames.length,
            completed: true,
            time,
            hidden: false,
          };
          backup.chapterMarkers.push(chm);
        } catch (e) {
          console.error(
            `error creating chapter marker for chapter ${chapter.id}: ${e.message}`
          );
        }
      } else {
        idx--;
      }
    }
  }

  // now look for a library manga
  for (const sourceManga of backup.sourceMangas) {
    if (sourceManga.sourceId === MANGADEX_SOURCE_ID) {
      const status = statuses[sourceManga.mangaId] || "reading";
      const libraryTab = tabMap.get(status);
      const libraryManga = backup.library.find(
        (l) => l.manga.id === sourceManga.manga.id
      );
      let updates = 0;
      try {
        // this isn't exact, but better than having to tap each one individually
        updates = await MFA.Manga.getFeedCount(sourceManga.mangaId, {
          limit: 1,
          translatedLanguage: ["en"],
          createdAtSince: "2021-04-01T00:00:00", // around when the hack happened
        });
      } catch (e) {
        console.error(
          `failed to get feed count for manga ${sourceManga.mangaId}: ${e.message}`
        );
      }
      if (!libraryManga) {
        backup.library.push({
          lastRead: 0,
          lastUpdated: 0,
          dateBookmarked: 650645332.25231397,
          libraryTabs: [libraryTab],
          updates,
          manga: sourceManga.manga,
        });
      } else {
        libraryManga.updates = updates;
        const existingTag = libraryManga.libraryTabs.find(
          (t) => t.id === libraryTab.id
        );
        if (!existingTag) {
          libraryManga.libraryTabs.push(libraryTab);
        }
      }
    }
  }

  await writeFile(filename, JSON.stringify(backup));
};
