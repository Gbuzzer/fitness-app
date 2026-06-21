"""
extract_activities.py
Reads all JSON files from Motion path detail data & description.
Extracts each activity anchored on "recordId" (500 chars context before).
Output: data/activities.json
"""

import re
import json
from pathlib import Path
from datetime import datetime, timezone

SOURCE_DIR = r"C:\Users\georg.brutzer\OneDrive\06 GenAI\02 HUAWEI Data\HUAWEI_HEALTH_20260421175257\Motion path detail data & description"
OUTPUT     = Path(__file__).parent / "activities.json"

SPORT_LABELS = {
    3: "Radfahren",
    4: "Joggen",
    5: "Wandern",
}

# ── helpers ──────────────────────────────────────────────────────────────────

def ms_to_parts(ms):
    """Return (datum YYYY-MM-DD, zeit HH:MM) from millisecond epoch."""
    if ms is None:
        return None, None
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def scalar(text, key):
    """Extract the first scalar value for `key` from a JSON fragment."""
    m = re.search(rf'"{key}"\s*:\s*(-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?|"[^"]*"|null)', text)
    if not m:
        return None
    raw = m.group(1)
    if raw == "null":
        return None
    if raw.startswith('"'):
        return raw.strip('"')
    try:
        f = float(raw)
        return int(f) if f == int(f) else f
    except ValueError:
        return raw


def parse_gps_track(attribute_str):
    """
    Parse GPS coordinates from the `attribute` field string.
    Format: tp=lbs;k=0;lat=50.61;lon=7.20;alt=0.0;t=1.64E9
    Returns list of {lat, lon, alt, t} dicts.
    """
    if not attribute_str:
        return []
    points = []
    # Each GPS record starts with "tp=lbs" or "istp=lbs"
    for segment in re.split(r'\n|\\n', attribute_str):
        lat = re.search(r'lat=(-?\d+\.\d+)', segment)
        lon = re.search(r'lon=(-?\d+\.\d+)', segment)
        alt = re.search(r'alt=(-?\d+(?:\.\d+)?)', segment)
        t   = re.search(r'\bt=(-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)', segment)
        if lat and lon:
            points.append({
                "lat": float(lat.group(1)),
                "lon": float(lon.group(1)),
                "alt": float(alt.group(1)) if alt else None,
                "t":   float(t.group(1))   if t   else None,
            })
    return points


# ── main ─────────────────────────────────────────────────────────────────────

json_files = sorted(Path(SOURCE_DIR).glob("motion path detail data*.json"))
total = len(json_files)
print(f"Found {total} files in Motion path detail data\n")

activities = {}   # keyed by recordId for dedup

for i, path in enumerate(json_files, 1):
    print(f"[{i}/{total}] {path.name}")
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        print(f"  ERROR reading: {e}")
        continue

    # Iterate every recordId occurrence in the file
    for m in re.finditer(r'"recordId"\s*:\s*"([^"]+)"', content):
        record_id = m.group(1)
        if record_id in activities:
            continue

        # Window: 500 chars before recordId + 600 chars after (covers all summary fields)
        win_start = max(0, m.start() - 500)
        win_end   = min(len(content), m.end() + 600)
        window    = content[win_start:win_end]

        sport_type   = scalar(window, "sportType")
        start_ms     = scalar(window, "startTime")
        end_ms       = scalar(window, "endTime")
        total_time   = scalar(window, "totalTime")    # ms
        total_dist   = scalar(window, "totalDistance") # meters
        total_cal    = scalar(window, "totalCalories") # millicalories
        total_steps  = scalar(window, "totalSteps")

        if sport_type is None or start_ms is None:
            continue

        datum, zeit = ms_to_parts(start_ms)

        # GPS track – find the attribute field that precedes this recordId
        # Search backwards from window start in original content
        attr_search_start = max(0, win_start - 5_000)
        attr_block = content[attr_search_start:win_start + 200]
        attr_m = re.search(r'"attribute"\s*:\s*"(HW_EXT_TRACK_DETAIL@[^"]*)"', attr_block)
        gps_track = parse_gps_track(attr_m.group(1)) if attr_m else []

        activities[record_id] = {
            "recordId":     record_id,
            "datum":        datum,
            "zeit":         zeit,
            "startTime":    int(start_ms)  if start_ms  is not None else None,
            "endTime":      int(end_ms)    if end_ms    is not None else None,
            "sportType":    int(sport_type),
            "sportLabel":   SPORT_LABELS.get(int(sport_type), "Sonstiges"),
            "dauer_min":    round(total_time  / 60_000, 1) if total_time  else None,
            "distanz_km":   round(total_dist  / 1_000,  2) if total_dist  else None,
            "kalorien_kcal": int(round(total_cal / 1_000)) if total_cal  else None,
            "schritte":     int(total_steps)               if total_steps else None,
            "gps_track":    gps_track,
        }

# Sort by startTime
result = sorted(activities.values(), key=lambda x: x["startTime"] or 0)

OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n[OK] {len(result)} unique activities -> {OUTPUT.name}")

from collections import Counter
counts = Counter(a["sportType"] for a in result)
print("\nSport type breakdown:")
for st in sorted(counts):
    label = SPORT_LABELS.get(st, "Sonstiges")
    print(f"  Type {st:3d}  {label:<15}  {counts[st]:>4} activities")
