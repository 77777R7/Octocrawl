# Real-site run 2026-10-06

Command: `node research/parity/run-sites.mjs --batch F --record research/access/runs/2026-10-06-g1-health-F-off-6afb057.md`
Source commit: `6afb05720335ddee8919347c4c94e92f127ba9f1` (working tree had uncommitted changes)
Run: 2026-10-06T04:12:37.589Z → 2026-10-06T04:13:36.617Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 15 of 16 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 14/16; checks passing: 169/180.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| F01 | https://airtrunk.com/wp-content/uploads/2023/03/AirTrunk-Green-Financing-Framework-Final-1.pdf | 13/13 | — |
| F02 | https://sustainability.atmeta.com/asset/2025-environmental-data-index/ | 13/13 | — |
| F03 | https://sustainability.atmeta.com/asset/2025-independent-accountants-review-report/ | 13/13 | — |
| F04 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 12/12 | — |
| F05 | https://assets.sttelemediagdc.com/sttgdc/global_en/public/2024-08/STT_GDC_Sustainability-Linked_Financing_Framework_2024.pdf | 13/13 | — |
| F06 | https://assets.nebius.com/assets/79cf11ba-bb23-4cb8-802e-21dc155be31c/Nebius%202025%20Sustainability%20Report.pdf | 13/13 | — |
| F07 | https://iea.blob.core.windows.net/assets/de9dea13-b07d-42c5-a398-d1b3ae17d866/EnergyandAI.pdf | 13/13 | — |
| F08 | https://ec.europa.eu/eurostat/documents/15216629/22447468/KS-01-25-003-EN-N.pdf | 13/13 | — |
| F09 | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nrg_ind_ren/A.REN.PC.EU27_2020?format=SDMX-CSV | 13/13 | — |
| F10 | https://www150.statcan.gc.ca/n1/tbl/csv/17100005-eng.zip | 11/11 | — |
| F11 | https://www.insee.fr/fr/statistiques/8654458 | 1/10 | itemCount (P2-files); eachItem (P2-files); eachItem (P2-files); eachItem (scrape-formats.pdf-parser); eachItem (scrape-formats.pdf-parser); eachItem (scrape-formats.pdf-parser); eachItem (ER); eachItem (ER); eachItem (ER) |
| F12 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 2/4 | pdfPage "PUE, WUE, REF values for the following period - Fiscal Year 2025" data.markdown (scrape-formats.pdf-parser); pdfPage "Hillsboro – United States, OR 1.27 1.35 1.46" data.markdown (scrape-formats.pdf-parser) |
| F13 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 9/9 | — |
| F14 | https://assets.sttelemediagdc.com/sttgdc/global_en/public/2024-08/STT_GDC_Sustainability-Linked_Financing_Framework_2024.pdf | 9/9 | — |
| F15 | https://api.worldbank.org/v2/country/FR/indicator/SP.POP.TOTL?format=json&date=2020:2023 | 11/11 | — |
| F16 | https://assets.publishing.service.gov.uk/media/6aba6dd9a9c3d267bcccefb0/ET_5.1_SEP_26.xlsx | 10/10 | — |

Recorded values:

- F10 field file.bytes: 3880235

Failed checks with the observed value:

- F11 [P2-files] itemCount: 1
- F11 [P2-files] eachItem: 0 items, 0 failing
- F11 [P2-files] eachItem: 0 items, 0 failing
- F11 [scrape-formats.pdf-parser] eachItem: 0 items, 0 failing
- F11 [scrape-formats.pdf-parser] eachItem: 0 items, 0 failing
- F11 [scrape-formats.pdf-parser] eachItem: 0 items, 0 failing
- F11 [ER] eachItem: 0 items, 0 failing
- F11 [ER] eachItem: 0 items, 0 failing
- F11 [ER] eachItem: 1 items, 0 failing
- F12 [scrape-formats.pdf-parser] pdfPage `PUE, WUE, REF values for the following period - Fiscal Year 2025`: no <!-- page 1 --> marker
- F12 [scrape-formats.pdf-parser] pdfPage `Hillsboro – United States, OR 1.27 1.35 1.46`: no <!-- page 3 --> marker
