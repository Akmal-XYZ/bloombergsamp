from __future__ import annotations

import argparse
import csv
import json
import os
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_URL = "https://sa-mp.co.id/api/server.php"
DEFAULT_DEV_INTERVAL = 600
DEFAULT_PROD_INTERVAL = 600
MIN_INTERVAL = 10
REQUEST_TIMEOUT = 30
FIELDNAMES = [
    "timestamp",
    "ip",
    "port",
    "hostname",
    "gamemode",
    "mapname",
    "onlinePlayers",
    "maxplayers",
    "worldtime",
    "weather",
    "online",
]
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CSV_PATH = DATA_DIR / "servers.csv"
LOCK_PATH = DATA_DIR / "servers.csv.lock"


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(message: str) -> None:
    print(f"[{now_text()}] {message}")


def error(message: str) -> None:
    print(f"[ERROR] {message}")


def clamp_interval(interval: int) -> int:
    if interval < MIN_INTERVAL:
        print(
            f"[WARNING] Interval {interval}s is too low and may spam the API. "
            f"Using {MIN_INTERVAL}s instead."
        )
        return MIN_INTERVAL
    return interval


def resolve_interval(profile: str, interval: int | None) -> int:
    if interval is not None:
        return clamp_interval(interval)
    if profile == "dev":
        return DEFAULT_DEV_INTERVAL
    return DEFAULT_PROD_INTERVAL


def fetch_payload() -> list[dict]:
    request = Request(API_URL, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        payload = json.loads(response.read().decode(charset))

    if not isinstance(payload, list):
        raise ValueError("Unexpected API format: expected a JSON array.")

    return payload


def normalize_records(payload: Iterable[dict], timestamp: int) -> list[dict[str, int | str]]:
    records: list[dict[str, int | str]] = []

    for item in payload:
        if not isinstance(item, dict):
            continue

        ip = item.get("ipAddress") or item.get("ip")
        port = item.get("port")
        hostname = item.get("hostname") or ""
        gamemode = item.get("gamemode") or ""
        mapname = item.get("mapname") or item.get("map") or ""
        worldtime = item.get("worldtime") or item.get("time") or ""
        weather = item.get("weather")
        if weather is None:
            weather = ""
        online_flag = item.get("online")
        if online_flag is None:
            online_flag = 1
        online_players = item.get("onlinePlayers")
        max_players = item.get("maxplayers")

        if ip in (None, "") or port is None or online_players is None or max_players is None:
            continue

        try:
            record = {
                "timestamp": int(timestamp),
                "ip": str(ip),
                "port": int(port),
                "hostname": str(hostname),
                "gamemode": str(gamemode),
                "mapname": str(mapname),
                "onlinePlayers": int(online_players),
                "maxplayers": int(max_players),
                "worldtime": str(worldtime),
                "weather": str(weather),
                "online": int(online_flag),
            }
        except (TypeError, ValueError):
            continue

        records.append(record)

    return records


@contextmanager
def file_lock(lock_path: Path, timeout_seconds: int = 15, stale_seconds: int = 120):
    start_time = time.time()
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    while True:
        try:
            file_descriptor = os.open(
                str(lock_path),
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            )
            with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
                handle.write(f"{os.getpid()},{int(time.time())}")
            break
        except FileExistsError:
            try:
                age = time.time() - lock_path.stat().st_mtime
                if age > stale_seconds:
                    lock_path.unlink(missing_ok=True)
                    continue
            except FileNotFoundError:
                continue

            if time.time() - start_time >= timeout_seconds:
                raise TimeoutError("Timed out waiting for the CSV lock file.")
            time.sleep(0.25)

    try:
        yield
    finally:
        lock_path.unlink(missing_ok=True)


def append_records(records: list[dict[str, int | str]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with file_lock(LOCK_PATH):
        file_exists = CSV_PATH.exists()
        with CSV_PATH.open("a", newline="", encoding="utf-8") as csv_file:
            writer = csv.writer(csv_file)
            if not file_exists or CSV_PATH.stat().st_size == 0:
                writer.writerow(FIELDNAMES)

            for record in records:
                # Existing legacy CSV files keep their original header, but new rows can still
                # append the richer schema. The frontend handles 5-column, 8-column, and 10-column rows.
                row = [
                    record["timestamp"],
                    record["ip"],
                    record["port"],
                    record.get("hostname", ""),
                    record.get("gamemode", ""),
                    record.get("mapname", ""),
                    record["onlinePlayers"],
                    record["maxplayers"],
                    record.get("worldtime", ""),
                    record.get("weather", ""),
                    record.get("online", 1),
                ]
                writer.writerow(row)

            csv_file.flush()
            os.fsync(csv_file.fileno())


def collect_once(dev_mode: bool) -> bool:
    timestamp = int(time.time())

    try:
        payload = fetch_payload()
        records = normalize_records(payload, timestamp)
        append_records(records)
        log(f"Fetched {len(records)} servers | Saved successfully")
        if dev_mode:
            log("Development mode is active | Verbose logging enabled")
        return True
    except HTTPError as exc:
        error(f"Failed to fetch API ({exc.code} {exc.reason})")
    except URLError as exc:
        error(f"Failed to fetch API ({exc.reason})")
    except TimeoutError as exc:
        error(f"Failed to save CSV ({exc})")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        error(f"Collector run failed ({exc})")

    return False


def run_loop(interval: int) -> int:
    dev_mode = interval <= 120
    log(f"Loop mode started | Interval: {interval}s")

    try:
        while True:
            collect_once(dev_mode=dev_mode)
            if dev_mode:
                log(f"Sleeping for {interval} seconds before the next run")
            time.sleep(interval)
    except KeyboardInterrupt:
        log("Collector stopped by user")
        return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Collect SA-MP server metrics into a local CSV file."
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Keep collecting on an interval instead of running once.",
    )
    parser.add_argument(
        "--interval",
        type=int,
        help="Collection interval in seconds. Minimum is 10 seconds.",
    )
    parser.add_argument(
        "--profile",
        choices=("dev", "prod"),
        default="prod",
        help="Default interval profile when --interval is not provided.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    interval = resolve_interval(profile=args.profile, interval=args.interval)

    if args.loop:
        return run_loop(interval)

    dev_mode = interval <= 120
    return 0 if collect_once(dev_mode=dev_mode) else 1


if __name__ == "__main__":
    raise SystemExit(main())
