"""
build_dataset.py
Joins activities.json with heartrate.json and minutes.json.
For each activity, attaches all heartrate and minute entries that
fall within [startTime, endTime].
Output: data/activities_enriched.json
"""

import json
import bisect
from pathlib import Path

DATA_DIR = Path(__file__).parent

def load(filename):
    path = DATA_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"{filename} not found — run the extract scripts first.")
    return json.loads(path.read_text(encoding="utf-8"))

print("Loading source files...")
activities = load("activities.json")
heartrate  = load("heartrate.json")
minutes    = load("minutes.json")
print(f"  {len(activities)} activities")
print(f"  {len(heartrate)} heart-rate points")
print(f"  {len(minutes)} minute entries\n")

# Build sorted index arrays for fast range lookups
hr_times  = [r["startTime"] for r in heartrate]
min_times = [r["startTime"] for r in minutes]

def range_slice(sorted_list, sorted_times, t_start, t_end):
    """Return all items whose startTime is in [t_start, t_end]."""
    lo = bisect.bisect_left(sorted_times,  t_start)
    hi = bisect.bisect_right(sorted_times, t_end)
    return sorted_list[lo:hi]

total = len(activities)
enriched = []

for i, act in enumerate(activities, 1):
    print(f"[{i}/{total}] {act.get('datum')} {act.get('sportLabel','?'):12s}  {act.get('distanz_km','?')} km")

    t_start = act.get("startTime")
    t_end   = act.get("endTime")

    if t_start is None or t_end is None:
        hr_slice  = []
        min_slice = []
    else:
        hr_slice = [
            {"bpm": r["bpm"], "startTime": r["startTime"]}
            for r in range_slice(heartrate, hr_times, t_start, t_end)
        ]
        min_slice = [
            {
                "startTime": r["startTime"],
                "steps":     r["steps"],
                "distance":  r["distance"],
                "calorie":   r["calorie_kcal"],
                "altitude":  r["altitude"],
            }
            for r in range_slice(minutes, min_times, t_start, t_end)
        ]

    # Derived heart-rate stats
    hr_stats = {}
    if hr_slice:
        bpms = [p["bpm"] for p in hr_slice]
        hr_stats = {
            "hr_avg": round(sum(bpms) / len(bpms)),
            "hr_max": max(bpms),
            "hr_min": min(bpms),
        }

    enriched.append({
        **act,
        **hr_stats,
        "heartrate": hr_slice,
        "minutes":   min_slice,
    })

output_path = DATA_DIR / "activities_enriched.json"
output_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8")

# Summary
with_hr  = sum(1 for a in enriched if a.get("heartrate"))
with_min = sum(1 for a in enriched if a.get("minutes"))
print(f"\n[OK] {len(enriched)} enriched activities -> {output_path.name}")
print(f"     {with_hr} have heart-rate data")
print(f"     {with_min} have per-minute data")
