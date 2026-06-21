"""
extract_minutes.py
Reads all JSON files from Sport per minute merged data & description.
Extracts per-minute entries from sportDataUserData[].sportBasicInfos[0].
Output: data/minutes.json
"""

import json
from pathlib import Path

SOURCE_DIR = r"C:\Users\georg.brutzer\OneDrive\06 GenAI\02 HUAWEI Data\HUAWEI_HEALTH_20260421175257\Sport per minute merged data & description"
OUTPUT     = Path(__file__).parent / "minutes.json"

json_files = sorted(Path(SOURCE_DIR).glob("sport per minute merged data*.json"))
total = len(json_files)
print(f"Found {total} files in Sport per minute merged data\n")

minutes = {}  # keyed by startTime for dedup

for i, path in enumerate(json_files, 1):
    print(f"[{i}/{total}] {path.name}")
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        print(f"  ERROR parsing JSON: {e}")
        continue

    day_records = data if isinstance(data, list) else [data]

    for day in day_records:
        if not isinstance(day, dict):
            continue

        sport_entries = day.get("sportDataUserData")
        if not isinstance(sport_entries, list):
            continue

        for entry in sport_entries:
            if not isinstance(entry, dict):
                continue

            start_ms   = entry.get("startTime")
            end_ms     = entry.get("endTime")
            sport_type = entry.get("sportType")

            if start_ms is None:
                continue

            infos = entry.get("sportBasicInfos")
            info  = infos[0] if isinstance(infos, list) and infos else {}

            key = int(start_ms)
            if key in minutes:
                continue

            cal_raw = info.get("calorie")  # Huawei stores in millicalories

            minutes[key] = {
                "startTime":  int(start_ms),
                "endTime":    int(end_ms)   if end_ms    is not None else None,
                "sportType":  int(sport_type) if sport_type is not None else None,
                "steps":      info.get("steps"),
                "distance":   info.get("distance"),   # meters
                "calorie_kcal": round(cal_raw / 1_000, 3) if cal_raw is not None else None,
                "altitude":   info.get("altitude"),
                "duration":   info.get("duration"),   # minutes
            }

result = sorted(minutes.values(), key=lambda x: x["startTime"])

OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n[OK] {len(result)} unique minute-entries -> {OUTPUT.name}")
if result:
    from datetime import datetime, timezone
    first = datetime.fromtimestamp(result[0]["startTime"]  / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    last  = datetime.fromtimestamp(result[-1]["startTime"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    print(f"     Date range: {first} – {last}")
