"""
extract_heartrate.py
Reads all JSON files from Health detail data & description.
Extracts samplePoints where key = "DATA_POINT_DYNAMIC_HEARTRATE".
Output: data/heartrate.json
"""

import json
from pathlib import Path

SOURCE_DIR = r"C:\Users\georg.brutzer\OneDrive\06 GenAI\02 HUAWEI Data\HUAWEI_HEALTH_20260421175257\Health detail data & description"
OUTPUT     = Path(__file__).parent / "heartrate.json"

json_files = sorted(Path(SOURCE_DIR).glob("health detail data*.json"))
total = len(json_files)
print(f"Found {total} files in Health detail data\n")

points = {}   # keyed by startTime for dedup

for i, path in enumerate(json_files, 1):
    print(f"[{i}/{total}] {path.name}")
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        print(f"  ERROR parsing JSON: {e}")
        continue

    records = data if isinstance(data, list) else [data]

    for record in records:
        if not isinstance(record, dict):
            continue

        sample_points = record.get("samplePoints")
        if not isinstance(sample_points, list):
            continue

        for sp in sample_points:
            if not isinstance(sp, dict):
                continue
            if sp.get("key") != "DATA_POINT_DYNAMIC_HEARTRATE":
                continue

            start_ms = sp.get("startTime")
            end_ms   = sp.get("endTime")
            raw_val  = sp.get("value")

            if start_ms is None or raw_val is None:
                continue

            try:
                bpm = int(float(raw_val))
            except (ValueError, TypeError):
                continue

            if bpm <= 0 or bpm > 300:   # sanity filter
                continue

            key = int(start_ms)
            if key not in points:
                points[key] = {
                    "startTime": int(start_ms),
                    "endTime":   int(end_ms) if end_ms is not None else None,
                    "bpm":       bpm,
                }

result = sorted(points.values(), key=lambda x: x["startTime"])

OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n[OK] {len(result)} unique heart-rate points -> {OUTPUT.name}")
if result:
    bpms = [r["bpm"] for r in result]
    print(f"     BPM range: {min(bpms)} – {max(bpms)}, avg: {sum(bpms)/len(bpms):.0f}")
