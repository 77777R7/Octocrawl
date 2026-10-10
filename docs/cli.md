# Command line

The `octocrawl` command runs Octocrawl's engine in its own process. You do not need a server. Every option of the REST API works as a flag.

```bash
npx octocrawl scrape https://example.com --markdown
```

In a checkout of this repository, run `npm run w2l -- <command>` instead.

## Options as flags

`octocrawl` (the `@octocrawl/cli` package, also published as `octocrawl`; `npm run w2l -- <command>` in a checkout) runs the API's engine in its own process, so every option of the REST API works on the command line. Each option is a flag under its kebab-case name: `maxAge` is `--max-age`, `onlyMainContent: false` is `--no-only-main-content`, `includeTags` takes `a,b` and may repeat, `formats` takes `markdown,tables` or a JSON array for an entry with options, `parsers` takes `pdf`, `none` or JSON, `headers` takes JSON or `--header name=value` (repeatable), and the URLs are arguments. The request is checked by the REST API's own parser, so a value the API refuses is refused here with the same message (exit code 2).

## Commands

- `octocrawl scrape <url>` prints the scrape response as JSON (compact, as MCP gets it; `--debug` for the full one), or the Markdown alone with `--markdown`.
- `octocrawl batch <url>...` (or `--urls-file <file>`, one URL per line) and `octocrawl crawl <url>` run to the end and print `{ report, items }`. Ctrl-C leaves the job paused: `octocrawl crawl --resume <taskId>` continues a crawl (a crawl recorded as pending or running is refused, as another process may be running it), and a batch resumes when the API starts on the same task root. `--webhook` is not offered, since a command runs no delivery worker: send the job to `octocrawl serve` instead.
- `octocrawl map <url>` prints the map.
- `--out <dir>` writes `results.jsonl` (one result per line), `results.csv` (one row per page with its evidence, failed pages included: the columns of the Python client's `to_pandas()` without the Markdown, then `markdown_file`), `report.json` for a job, and per page `<n>-<host-path>.md` with its Markdown and `<n>-<host-path>.table-<i>.csv` for each table of the `tables` format.
- `octocrawl serve` runs the local API, as `npm run api` does, with the same flags (`--port`, `--host`, `--hosted`, `--token`, ...).
- `octocrawl login import <site>` saves your login to a site from the Chrome you already use, so `--mode authed` reads its pages signed in as you; `octocrawl login list` and `octocrawl login remove <site>` show and forget saved logins without printing a cookie. See [Your own login (mode authed)](access.md#your-own-login-mode-authed).

## Exit codes and the task root

Exit codes: 0 for a page read as content or a completed job, 1 for anything else Octocrawl answered, 2 for a refused command line, 130 when interrupted. The task root, where tasks, saved files and the page cache live, is `--task-root`, else `W2L_TASK_ROOT`, else `.w2l/cli`, apart from the API's `.w2l/api`; never point a command at the task root of a running API server, which could run the same job twice. A command never resumes the task root's earlier jobs, as the API does when it starts. The earlier in-process ladder tool is `w2l-ladder` (and `w2l-fetch`) in `@w2l/bench`.
