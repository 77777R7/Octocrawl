import hashlib, json, re, sys
d = json.load(open(sys.argv[1]))
md = d["markdown"]
lines = md.split("\n"); inside = False; heads = 0; fences = 0; seps = 0
for l in lines:
    if l.startswith("```"):
        fences += 1; inside = not inside; continue
    if inside: continue
    if re.match(r"#{1,6} ", l): heads += 1
    if re.match(r"\|\s*:?-{3,}", l): seps += 1
er = d["evidenceRecord"]
print(json.dumps({"status": d["status"], "lane": d["lane"], "wallMs": round(d["usage"]["wallMs"]), "contentTokens": d["usage"].get("contentTokens"),
  "markdownChars": len(md), "headings": heads, "tables": seps, "codeBlocks": fences // 2,
  "fetchedAt": er["fetchedAt"], "outputSha256.markdown": er["outputSha256"]["markdown"],
  "sha256OfMarkdownAsReceived": hashlib.sha256(md.encode("utf-8")).hexdigest(),
  "extractor": er["extractor"]["version"]}, indent=1))
