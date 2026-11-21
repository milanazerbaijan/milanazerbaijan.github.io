# AC Milan Azerbaijan — xəbər rutini üçün qaydalar (sahibin qərarı, 21.11.2026)

These rules come from the site owner and override the scheduled routine prompt where they differ:

- **Board paused.** Do NOT read or write the Claude board (ArtifactData, artifact QuaXj8fWH6hXr1tu5mwwaH) — no items, no widgets — unless the owner asks for it in a live message. Skip every board step of the routine.
- **Site only.** Still find the news and write each item at Instagram-caption size (600–1000 chars; line-ups/ratings/press conferences up to ~1500), build W/new/items/<doc_id>.json as before, then run `python3 -I tools/news.py build W/new`, commit data.json and push.
- **Tables without the board.** When TABLES_DUE is yes, get a table's current shape from the site instead of the board (run in the repo root):
  `python3 -I -c "import json,sys; json.dump(json.load(open('data.json',encoding='utf-8'))[sys.argv[1]], open(sys.argv[2],'w',encoding='utf-8'), ensure_ascii=False, indent=1)" <id> W/old/<id>.json`
  then write rebuilt tables to W/new/widgets/<id>.json (no if_version needed).
- **Network.** If news sites cannot be opened (proxy 403 / ENOTFOUND), write nothing and send a PushNotification saying the environment's network access must allow the news sites.
- Final report: drop the "Pano: …" part; keep "Site: <commit or 'değişiklik yok'>".
