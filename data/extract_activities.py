"""
extract_activities.py
Reads all JSON files from Motion path detail data & description.
GPS tracks are extracted by locating attribute fields and matching to the
recordId that follows within ~1500 chars (attribute comes BEFORE recordId
in each JSON object, up to ~174KB earlier).
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

GPS_MAX_POINTS = 200  # subsample to this many points per activity

# ── helpers ──────────────────────────────────────────────────────────────────

def ms_to_parts(ms):
    if ms is None:
        return None, None
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def scalar(text, key):
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
    """Parse GPS coordinates from HW_EXT_TRACK_DETAIL attribute string."""
    points = []
    for segment in re.split(r'\n|\\n', attribute_str):
        lat = re.search(r'lat=(-?\d+\.\d+)', segment)
        lon = re.search(r'lon=(-?\d+\.\d+)', segment)
        if lat and lon:
            alt_m = re.search(r'alt=(-?\d+(?:\.\d+)?)', segment)
            points.append({
                "lat": float(lat.group(1)),
                "lon": float(lon.group(1)),
                "alt": float(alt_m.group(1)) if alt_m else None,
            })
    return points


def subsample_gps(points, max_n=GPS_MAX_POINTS):
    if len(points) <= max_n:
        return points
    indices = [int(i * (len(points) - 1) / (max_n - 1)) for i in range(max_n)]
    return [points[i] for i in indices]


def extract_gps_map(content):
    """
    Scan the file content for 'HW_EXT_TRACK_DETAIL@' attribute strings.
    For each, find the closing quote and look for the recordId in the next
    1500 chars. Returns dict: recordId -> gps_points_list.
    """
    result = {}
    pos = 0
    while True:
        marker = content.find('"HW_EXT_TRACK_DETAIL@', pos)
        if marker == -1:
            break

        # Find the closing unescaped quote of this JSON string value.
        # marker points at the opening " of the value string.
        j = marker + 1
        while j < len(content):
            q = content.find('"', j)
            if q == -1:
                j = len(content)
                break
            # Count preceding backslashes (even = unescaped quote)
            nb = 0
            k = q - 1
            while k > marker and content[k] == '\\':
                nb += 1
                k -= 1
            if nb % 2 == 0:
                j = q
                break
            j = q + 1

        attr_str = content[marker + 1:j]  # GPS string content (starts with HW_EXT_TRACK_DETAIL@)

        # Find the recordId for this activity in the next 1500 chars after the closing quote
        tail = content[j: j + 1500]
        rm = re.search(r'"recordId"\s*:\s*"([^"]+)"', tail)
        if rm:
            gps = parse_gps_track(attr_str)
            if gps:
                result[rm.group(1)] = subsample_gps(gps)

        pos = j + 1

    return result


# ── main ─────────────────────────────────────────────────────────────────────

json_files = sorted(Path(SOURCE_DIR).glob("motion path detail data*.json"))
total = len(json_files)
print(f"Found {total} files in Motion path detail data\n")

activities = {}

for i, path in enumerate(json_files, 1):
    print(f"[{i}/{total}] {path.name}")
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        print(f"  ERROR reading: {e}")
        continue

    gps_map = extract_gps_map(content)
    if gps_map:
        print(f"  GPS tracks found: {len(gps_map)}")

    for m in re.finditer(r'"recordId"\s*:\s*"([^"]+)"', content):
        record_id = m.group(1)
        if record_id in activities:
            continue

        win_start = max(0, m.start() - 500)
        win_end   = min(len(content), m.end() + 600)
        window    = content[win_start:win_end]

        sport_type  = scalar(window, "sportType")
        start_ms    = scalar(window, "startTime")
        end_ms      = scalar(window, "endTime")
        total_time  = scalar(window, "totalTime")
        total_dist  = scalar(window, "totalDistance")
        total_cal   = scalar(window, "totalCalories")
        total_steps = scalar(window, "totalSteps")

        if sport_type is None or start_ms is None:
            continue

        datum, zeit = ms_to_parts(start_ms)

        activities[record_id] = {
            "recordId":      record_id,
            "datum":         datum,
            "zeit":          zeit,
            "startTime":     int(start_ms) if start_ms is not None else None,
            "endTime":       int(end_ms)   if end_ms   is not None else None,
            "sportType":     int(sport_type),
            "sportLabel":    SPORT_LABELS.get(int(sport_type), "Sonstiges"),
            "dauer_min":     round(total_time / 60_000, 1) if total_time  else None,
            "distanz_km":    round(total_dist / 1_000,  2) if total_dist  else None,
            "kalorien_kcal": int(round(total_cal / 1_000)) if total_cal   else None,
            "schritte":      int(total_steps)               if total_steps else None,
            "gps_track":     gps_map.get(record_id, []),
        }

result = sorted(activities.values(), key=lambda x: x["startTime"] or 0)
OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n[OK] {len(result)} unique activities -> {OUTPUT.name}")

from collections import Counter
counts = Counter(a["sportType"] for a in result)
print("\nSport type breakdown:")
for st in sorted(counts):
    print(f"  Type {st:3d}  {SPORT_LABELS.get(st,'Sonstiges'):<15}  {counts[st]:>4} activities")

with_gps = [a for a in result if a["gps_track"]]
print(f"\n{len(with_gps)} activities have GPS tracks")
if with_gps:
    avg_pts = sum(len(a["gps_track"]) for a in with_gps) / len(with_gps)
    print(f"Average GPS points per activity: {avg_pts:.0f}")
