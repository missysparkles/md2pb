# Mangadex to Paperback

Uses Mangadex API to add titles to your Paperback backup.

## For simplest usage

```
npx github:missysparkles/md2pb sync --username=<username> --password=<password> [backupfile]
```

For security you can put your username and password in a JSON file called `.md_credentials` instead.

```
{
    "username":"myusername",
    "password":"mypassword"
}
```

If the filename provided for the backup does not exist a new file will be created instead.
If the file does exist, it will be backed up to a copy of the file ending with `.bk`. Any existing backups with that name will be overwritten.

## Usage

```
md2pb sync [filename]

adds manga from mangadex to your backup

Positionals:
  filename                                    [string] [default: "PB-BKUP.json"]

Options:
      --version   Show version number                                  [boolean]
      --help      Show help                                            [boolean]
  -u, --username  MangaDex username                          [string] [required]
      --password  MangaDex password                          [string] [required]
```

## Thanks

- [Paperback-iOS/Tachiyomi-To-Paperbackup-Converter](https://github.com/Paperback-iOS/Tachiyomi-To-Paperbackup-Converter) for showing we what could be done, esp. [Paperback-iOS/Tachiyomi-To-Paperbackup-Converter#3](https://github.com/Paperback-iOS/Tachiyomi-To-Paperbackup-Converter/pull/3) for the latest details.
- [bdashore3/Tsuchi2Paperback](https://github.com/bdashore3/Tsuchi2Paperback) for showing how little actually needs to be filled out for a backup to work.
