"""Helper for the AC Milan Azerbaijan news routine. Works on data.json only.
  python3 -I tools/news.py recent [N]   compact list of the newest N site items (dedup check)
  python3 -I tools/news.py tables       Milan rows + whether the tables are due today
  python3 -I tools/news.py build DIR    merge DIR/items/*.json (board docs) and DIR/widgets/*.json into data.json
"""
import json, re, glob, os, sys, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data.json')
WIDGETS = ["serieA", "europaLeague", "fixtures", "injuries", "scorers"]
R = [(0x1F000,0x1FAFF),(0x2600,0x27BF),(0x2B00,0x2BFF),(0x231A,0x23FF),(0xFE0F,0xFE0F),(0x200D,0x200D)]
EMO = re.compile('[' + ''.join(re.escape(chr(a)) + '-' + re.escape(chr(b)) for a, b in R) + ']')
POINT = chr(0x1F447)
NOW = dt.datetime.now(dt.timezone.utc)

def load(p):
    with open(p, encoding='utf-8') as f: return json.load(f)

def ts(s):
    try: return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception: return None

def clean(s): return re.sub(r'\s{2,}', ' ', EMO.sub('', s)).strip(' -:' + chr(0x2014) + chr(0x2013))

def to_site(did, d):
    lines = [l for l in d.get('ig', '').split('\n') if not l.strip().startswith('#')
             and 'Əsas mənbə' not in l and not l.rstrip().endswith(POINT)]
    t = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
    title, _, body = t.partition('\n')
    return {"id": did, "kind": d.get('kind'), "title": clean(title), "body": body.strip(),
            "summary": d.get('summary'), "source": d.get('source'), "sourceUrl": d.get('sourceUrl'), "date": d.get('runAt')}

def recent(n=20):
    for it in load(DATA)['items'][:n]:
        print(f"{it['id']} | {it.get('kind')} | {it.get('title')} | {it.get('sourceUrl')}")

def tables():
    d = load(DATA)
    for k in WIDGETS:
        w = d.get(k) or {}
        print(f"{k}: updatedAt {w.get('updatedAt')} | {w.get('note', '')}")
    for k in ("serieA", "europaLeague"):
        rows = (d.get(k) or {}).get('rows', [])
        m = next((r for r in rows if r.get('team') == 'Milan'), None)
        lead = rows[0] if rows else {}
        print(f"{k} Milan: {m} | leader: {lead.get('team')} {lead.get('pts')}")
    baku = NOW + dt.timedelta(hours=4)
    due, why = baku.hour < 10, "morning run" if baku.hour < 10 else ""
    upd = ts((d.get('serieA') or {}).get('updatedAt', '')) or NOW - dt.timedelta(days=30)
    for f in (d.get('fixtures') or {}).get('items', []):
        k = ts(f.get('utc', ''))
        if k and upd < k + dt.timedelta(hours=2, minutes=15) <= NOW:
            due, why = True, f"Milan played {f.get('opp')} at {f.get('utc')} after last table update"
    print("TABLES_DUE:", "yes" if due else "no", why)

def build(src):
    d = load(DATA)
    old = {it['id'] for it in d['items']}
    new = []
    for f in glob.glob(os.path.join(src, 'items', '*.json')):
        doc = load(f)
        new.append((doc.get('sortKey', 0), to_site(os.path.basename(f)[:-5], doc)))
    new.sort(key=lambda x: x[0], reverse=True)
    ids = {it['id'] for _, it in new}
    d['items'] = ([it for _, it in new] + [it for it in d['items'] if it['id'] not in ids])[:100]
    changed = []
    for k in WIDGETS:
        p = os.path.join(src, 'widgets', k + '.json')
        if os.path.exists(p): d[k] = load(p); changed.append(k)
    d['generated'] = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')
    with open(DATA, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, indent=1)
    print(f"{len(d['items'])} items on site, {len(ids - old)} new; widgets replaced: {changed or 'none'}")

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['recent']: recent(int(a[1]) if len(a) > 1 else 20)
    elif a[:1] == ['tables']: tables()
    elif a[:1] == ['build'] and len(a) == 2: build(a[1])
    else: print(__doc__)
