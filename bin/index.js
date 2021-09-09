#! /usr/bin/env node
const { promisify } = require("util");

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const { sync } = require("../src/sync");

const readFile = promisify(require("fs").readFile);

async function normalizeCredentials(argv) {
  if (!argv.username || !argv.password) {
    return JSON.parse(await readFile("./.md_credentials"));
  }
  return {};
}

yargs(hideBin(process.argv))
  .scriptName("md2pb")
  .usage("$0 <cmd> [args]")
  .command(
    "sync [filename]",
    "adds manga from mangadex to your backup",
    (yargs) => {
      yargs
        .option("username", {
          describe: "MangaDex username",
          alias: "u",
          type: "string",
        })
        .option("password", {
          describe: "MangaDex password",
          type: "string",
        })
        .positional("filename", {
          describe: "",
          type: "string",
          default: "PB-BKUP.json",
        })
        .demandOption(
          ["username", "password"],
          "Please provide MangaDex credentials."
        );
    },
    async (argv) => {
      await sync(argv.username, argv.password, argv.filename);
    }
  )
  .middleware([normalizeCredentials], true)
  .help().argv;
