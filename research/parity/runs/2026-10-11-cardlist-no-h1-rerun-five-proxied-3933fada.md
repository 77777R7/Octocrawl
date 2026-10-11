# Real-site run 2026-10-11

Command: `node research/parity/run-sites.mjs --only F01,F10,M12,PD01,AC02 --record research/parity/runs/2026-10-11-cardlist-no-h1-rerun-five-proxied-3933fada.md`
Source commit: `3933fadaaffc26fba58a5230c083af41c7373483`
Run: 2026-10-11T12:23:22.088Z → 2026-10-11T12:24:40.544Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 5 of 5 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 4/5; checks passing: 34/46.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| F01 | https://airtrunk.com/wp-content/uploads/2023/03/AirTrunk-Green-Financing-Framework-Final-1.pdf | 1/13 | field status (P2-files); field channelsTried (P2-files); pdfPage "PUEs as low as 1.15" (scrape-formats.pdf-parser); pdfPage "Portfolio average annual operating PUE for FY24 is 1.32" (scrape-formats.pdf-parser); pdfPage "A$10 billion+ in debt across our portfolio as at February 2025" (scrape-formats.pdf-parser); field file.pdf.pageCount (scrape-formats.pdf-parser); field file.pdf.warnings.0.code (scrape-formats.pdf-parser); field evidenceRecord.artifacts.0.kind (ER); field evidenceRecord.artifacts.0.sha256 (ER); field evidenceRecord.artifacts.0.bytes (ER); field evidenceRecord.rawSha256 (ER); field evidenceRecord.extractor.version (ER) |
| F10 | https://www150.statcan.gc.ca/n1/tbl/csv/17100005-eng.zip | 11/11 | — |
| M12 | https://www.eia.gov/electricity/annual/html/epa_01_01.html | 10/10 | — |
| PD01 | https://www.eia.gov/outlooks/ieo/pdf/IEO2023_Narrative.pdf | 8/8 | — |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 4/4 | — |

Recorded values:

- F10 field file.bytes: 3880235
- M12 field document.strategy: table
- PD01 field file.pdf.pageCount: 70

Failed checks with the observed value:

- F01 [P2-files] field `status`: blocked
- F01 [P2-files] field `channelsTried`: ["http","browser_local"]
- F01 [scrape-formats.pdf-parser] pdfPage `PUEs as low as 1.15`: no <!-- page 3 --> marker
- F01 [scrape-formats.pdf-parser] pdfPage `Portfolio average annual operating PUE for FY24 is 1.32`: no <!-- page 3 --> marker
- F01 [scrape-formats.pdf-parser] pdfPage `A$10 billion+ in debt across our portfolio as at February 2025`: no <!-- page 5 --> marker
- F01 [scrape-formats.pdf-parser] field `file.pdf.pageCount`: absent
- F01 [scrape-formats.pdf-parser] field `file.pdf.warnings.0.code`: absent
- F01 [ER] field `evidenceRecord.artifacts.0.kind`: absent
- F01 [ER] field `evidenceRecord.artifacts.0.sha256`: absent
- F01 [ER] field `evidenceRecord.artifacts.0.bytes`: absent
- F01 [ER] field `evidenceRecord.rawSha256`: e25fb75bbbce2860cd707266396eb5ad564b8165cbb44cc3c32e5ee5fe695064
- F01 [ER] field `evidenceRecord.extractor.version`: extract-tf/22
