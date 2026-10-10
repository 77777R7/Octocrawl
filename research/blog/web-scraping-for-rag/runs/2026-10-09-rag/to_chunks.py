import json
import re

from octocrawl_client import W2L

urls = [line.strip() for line in open("urls.txt") if line.strip()]

with W2L() as client:  # http://127.0.0.1:8787, where `npx octocrawl serve` listens
    job = client.batch(urls, formats=["markdown"])

with open("chunks.jsonl", "w") as out:
    for item in job.items:
        if item["status"] not in ("success", "partial"):
            print("skipped", item["url"], item["status"], item.get("failureReason"))
            continue
        evidence = item["evidenceRecord"]
        # One chunk per section: split before each ## or ### heading.
        sections = re.split(r"\n(?=#{2,3} )", item["markdown"])
        for n, text in enumerate(sections):
            out.write(json.dumps({
                "id": f"{evidence['outputSha256']['markdown'][:16]}-{n}",
                "url": evidence["finalUrl"],
                "fetched_at": evidence["fetchedAt"],
                "markdown_sha256": evidence["outputSha256"]["markdown"],
                "text": text.strip(),
            }) + "\n")
