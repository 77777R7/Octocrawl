# Real-site run 2026-10-12

Command: `node research/parity/run-sites.mjs --only M09,M10,TB07,PD01,AC24,AR09 --record research/parity/runs/2026-10-13-health-recheck-1-proxied-fb992cd2.md`
Source commit: `fb992cd2a129d3583bc3144858b60ea5c6184bb3`
Run: 2026-10-12T18:39:54.150Z → 2026-10-12T18:40:49.378Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 4 of 6 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 3/6; checks passing: 28/40.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M09 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48L2hlYWQ-PGJvZHk-PHA-VGhpcyBwYWdlIG1vdmVkLjwvcD48c2NyaXB0PmxvY2F0aW9uLnJlcGxhY2UoImh0dHBzOi8vYm9va3MudG9zY3JhcGUuY29tL2NhdGFsb2d1ZS9kb2VzLW5vdC1leGlzdC13MmwvaW5kZXguaHRtbCIpPC9zY3JpcHQ-PC9ib2R5PjwvaHRtbD4= | 12/12 | — |
| M10 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48bWV0YSBodHRwLWVxdWl2PSJyZWZyZXNoIiBjb250ZW50PSIwO3VybD1odHRwczovL2Jvb2tzLnRvc2NyYXBlLmNvbS9jYXRhbG9ndWUvZG9lcy1ub3QtZXhpc3QtdzJsL2luZGV4Lmh0bWwiPjwvaGVhZD48Ym9keT48cD5UaGlzIHBhZ2UgbW92ZWQuPC9wPjwvYm9keT48L2h0bWw- | 7/7 | — |
| TB07 | https://www.eia.gov/electricity/annual/html/epa_01_01.html | 1/4 | field status (tables-csv); tablesConsistent (tables-csv); eachItem tables (tables-csv) |
| PD01 | https://www.eia.gov/outlooks/ieo/pdf/IEO2023_Narrative.pdf | 2/8 | field status (scrape-formats.pdf-parser); field file.pdf.pagesRead (scrape-formats.pdf-parser); field file.pdf.pageCount (scrape-formats.pdf-parser); field pages.length (scrape-formats.pdf-pages); field pages.1.pageNumber (scrape-formats.pdf-pages); markdownExcludes "<!-- page" (scrape-formats.pdf-page-markers) |
| AC24 | https://the-internet.herokuapp.com/key_presses | 1/4 | field status (action-step); traceEvent (action-step); markdownIncludes "You entered: ESCAPE" (action-press) |
| AR09 | https://www.gov.uk/find-local-council | 5/5 | — |

Recorded values:

- PD01 field file.pdf.pageCount: undefined

Failed checks with the observed value:

- TB07 [tables-csv] field `status`: failed
- TB07 [tables-csv] tablesConsistent: no tables
- TB07 [tables-csv] eachItem `tables`: 0 items, 0 failing
- PD01 [scrape-formats.pdf-parser] field `status`: failed
- PD01 [scrape-formats.pdf-parser] field `file.pdf.pagesRead`: absent
- PD01 [scrape-formats.pdf-parser] field `file.pdf.pageCount`: absent
- PD01 [scrape-formats.pdf-pages] field `pages.length`: absent
- PD01 [scrape-formats.pdf-pages] field `pages.1.pageNumber`: absent
- PD01 [scrape-formats.pdf-page-markers] markdownExcludes `<!-- page`: no markdown
- AC24 [action-step] field `status`: failed
- AC24 [action-step] traceEvent: 0 of 6 events match
- AC24 [action-press] markdownIncludes `You entered: ESCAPE`: no markdown
