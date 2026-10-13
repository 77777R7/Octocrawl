# nodriver arm of the library probe (label: library_probe): the installed Google Chrome, headed, a fresh
# temporary profile per URL, driven over raw CDP. A measurement oracle only (AGPL-3.0, Python): never shipped.
# Proxy: PROBE_PROXY=http://127.0.0.1:<port> (a local forwarder that adds the gateway's login), or none.
# The main response's status is not read; pass = no challenge wording and over 2,000 bytes, data = the task's checks.
# Usage: python probe_nodriver.py input.json out.json
import asyncio, json, os, re, sys, time
from datetime import datetime, timezone
import nodriver as uc

CHALLENGE = re.compile(r"just a moment|checking your browser|verify you are human|access denied|captcha|attention required|press & hold|are you a robot|unusual activity", re.I)
WAIT_S = int(os.environ.get('WAIT_MS', '20000')) / 1000
PROXY = os.environ.get('PROBE_PROXY')

def checks(task, text):
    ok = True
    for p in task['predicates']:
        flags = re.I if 'i' in (p.get('flags') or '') else 0
        n = len(re.findall(p['pattern'], text, flags))
        ok = ok and (n >= p['min'] if p['type'] == 'markdownCountMin' else n > 0)
    return ok

async def look(task):
    started = time.time()
    args = [f'--proxy-server={PROXY}'] if PROXY else []
    browser = await uc.start(headless=False, browser_args=args)
    try:
        tab = await browser.get(task['url'])
        html, text = '', ''
        until = time.time() + WAIT_S
        while True:
            await tab.sleep(1)
            html = await tab.get_content() or ''
            text = await tab.evaluate('document.body ? document.body.innerText : ""') or ''
            if not CHALLENGE.search(html[:200000]) and len(text) > 200:
                break
            if time.time() > until:
                break
        challenge = bool(CHALLENGE.search(html[:200000]))
        title = await tab.evaluate('document.title') or ''
        return {'bytes': len(html), 'textChars': len(text), 'title': str(title)[:80], 'challenge': challenge,
                'pass': len(html) > 2000 and not challenge, 'data': checks(task, text), 'finalUrl': tab.url, 'ms': int((time.time() - started) * 1000)}
    finally:
        browser.stop()

async def main():
    tasks = json.load(open(sys.argv[1]))
    rows = []
    for task in tasks:
        try:
            r = await look(task)
        except Exception as e:
            r = {'error': str(e)[:160]}
        rows.append({'id': task['id'], 'url': task['url'], 'nodriver': r})
        print(task['id'], '| nodriver', 'ERR' if 'error' in r else f"pass={r['pass']} data={r['data']}", flush=True)
    json.dump({'meta': {'at': datetime.now(timezone.utc).isoformat(), 'egress': 'gateway via local forwarder' if PROXY else 'direct', 'arms': ['nodriver'], 'headed': True, 'waitMs': int(WAIT_S * 1000), 'label': 'library_probe'}, 'rows': rows}, open(sys.argv[2], 'w'), indent=1)

if __name__ == '__main__':
    uc.loop().run_until_complete(main())
