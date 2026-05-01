# SA-MP Local-First Analytics Dashboard

This project collects SA-MP server data from `https://sa-mp.co.id/api/server.php`, stores historical snapshots in CSV, and shows a Bloomberg-style analytics dashboard in the browser.

## Publish Mode (Vercel + Firebase RTDB)

This repo can be deployed to Vercel with serverless endpoints:

- `GET /api/data.csv?range=24h` serves CSV for the dashboard (range options: `10m`, `1h`, `6h`, `12h`, `24h`, `7d`, `30d`).

Firebase RTDB rules can stay locked (`.read=false`, `.write=false`) because the serverless functions use Firebase Admin credentials.

### Recommended: GitHub Actions collector (every 10 minutes)

Vercel Cron Jobs are configured in `vercel.json` to hit `/api/cron/collect` every 10 minutes (production only).

If you prefer collecting from GitHub Actions (for debugging), this repo also includes a manual workflow that collects snapshots and writes them to RTDB:

- Workflow: `.github/workflows/collect.yml`
- Script: `tools/collect_to_rtdb.js`
- Retention: keeps the latest 30 days of snapshots (older snapshots are deleted)

### Required Vercel Environment Variables

- `FIREBASE_DATABASE_URL` = `https://seadata-29809-default-rtdb.firebaseio.com`
- `FIREBASE_SERVICE_ACCOUNT_B64` = Base64 of the Firebase service account JSON file
- `CRON_SECRET` = random secret used by Vercel Cron Jobs (Authorization header)

Important: Never commit the Firebase service account JSON to GitHub.

### Required GitHub Actions Secrets

Set these repository secrets so the scheduled collector can write to Firebase:

- `FIREBASE_DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_B64`

## Project Structure

```text
C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
├── tools\
│   └── collector.py
├── data\
│   └── servers.csv
├── web\
│   ├── app.js
│   ├── index.html
│   ├── style.css
│   └── vendor\
│       └── chart.umd.min.js
└── README.md
```

## Requirements

- Windows 11
- Python 3.10+ installed and available as `python`
- Internet access when collecting fresh data

The dashboard itself is local-first and can be viewed offline after `data\servers.csv` exists. For fully offline chart rendering, this project also keeps a local fallback copy of Chart.js in `web\vendor\chart.umd.min.js`.

## Install

Open Command Prompt and run:

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
```

The collector uses only the Python standard library (no pip dependencies required).

## Run The Collector

### Single run

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
python tools\\collector.py
```

### Loop mode every 60 seconds

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
python tools\\collector.py --loop --interval 60
```

### Loop mode every 10 minutes

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
python tools\\collector.py --loop --interval 600
```

### Default profiles

Development defaults to 60 seconds:

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
python tools\\collector.py --loop --profile dev
```

Production defaults to 600 seconds:

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
python tools\\collector.py --loop --profile prod
```

### Collector behavior

- Minimum allowed interval is 10 seconds. Lower values are automatically changed to 10 seconds.
- Development mode is automatically treated as active when the effective interval is `<= 120` seconds.
- Each run prints a status line such as:

```text
[2026-04-21 12:30:00] Fetched 82 servers | Saved successfully
```

- On failure, the collector prints a readable error without crashing the loop:

```text
[ERROR] Failed to fetch API (403 Forbidden)
```

## Open The Dashboard

### Recommended: local web server

This avoids browser restrictions when JavaScript loads the CSV file.

```cmd
cd C:\Users\ADMIN\OneDrive\Pictures\bloombergsamp
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/web/
```

### Direct file open

You can also open:

```text
web\index.html
```

If your browser blocks auto-loading local files, click the `Load CSV` button and choose `data\servers.csv`.

## Dashboard Features

- Market overview cards for total players, active servers, and tracked servers
- Top servers table ranked by current players
- Delta indicators for player and server movement
- Owner insight panel for momentum, peak time, volatility, capacity, spike/drop alert, and health score
- Search box for filtering by `ip:port`
- Pagination with 10 rows per page
- Historical line chart per selected server
- Manual refresh button

## New Features (Phase 1 Upgrade)

- `ISSG (Indeks Statistik Server Gabungan)` is a global utilization-style index calculated in the frontend as `SUM(onlinePlayers / maxplayers)` for each snapshot.
- The dashboard now shows the current ISSG, its delta versus the previous snapshot, percentage change, and a dedicated ISSG trend chart.
- The collector now captures additional metadata when available: `hostname`, `gamemode`, and `mapname`.
- The server table and selector prefer human-friendly hostnames and fall back to `ip:port` when metadata is missing.
- The server chart area now includes extra server detail for gamemode and map name.
- The UI uses a mixed Indonesian + English label style to keep the dashboard more accessible for local usage.

## Notes

- The collector uses a small lock file (`data\servers.csv.lock`) to reduce append conflicts in OneDrive.
- `data\servers.csv` grows over time because the collector appends historical snapshots instead of overwriting.
- Existing CSV files remain compatible. Older rows keep the original format, while new rows can include the extra metadata columns.
- If you want new data quickly while testing the UI, use `python tools\\collector.py --loop --interval 60`.
