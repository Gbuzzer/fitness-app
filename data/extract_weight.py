"""
extract_weight.py
Reads all JSON files from Health detail data & description.
Filters records with type=10006 (body-weight / body-composition).
Each record has one samplePoint with key="WEIGHT_BODYFAT_BROAD" whose
value is a nested JSON string containing all measured fields.

Field mapping to match honor_scale (data.json) naming:
  bodyWeight        -> gewicht_kg
  bodyFatRate       -> koerperfett_pct  (Huawei: 20.5  → stored as 0.205)
  bmi               -> bmi
  basalMetabolism   -> grundumsatz_kcal
  visceralFatLevel  -> viszeralfett
  muscleMass        -> muskelmasse_kg
  boneSalt          -> knochen_kg
  protein           -> protein_pct      (Huawei: 13.8  → stored as 0.138)
  moistureRate      -> koerperwasser_pct (Huawei: 55.2 → stored as 0.552)

  Extra fields (not in honor_scale, kept for completeness):
  bodyAge, bodyScore, skeletalMusclelMass, height

Output: data/weight_huawei.json  (same schema as data.json)
"""

import json
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

SOURCE_DIR = r"C:\Users\georg.brutzer\OneDrive\06 GenAI\02 HUAWEI Data\HUAWEI_HEALTH_20260421175257\Health detail data & description"
OUTPUT     = Path(__file__).parent / "weight_huawei.json"

WEIGHT_TYPE = 10006
WEIGHT_KEY  = "WEIGHT_BODYFAT_BROAD"

json_files = sorted(Path(SOURCE_DIR).glob("health detail data*.json"))
total = len(json_files)
print(f"Found {total} files in Health detail data\n")

entries  = {}          # keyed by startTime for dedup
key_counter = Counter()
type_counter = Counter()

for i, path in enumerate(json_files, 1):
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        print(f"[{i}/{total}] ERROR: {e}")
        continue

    records = data if isinstance(data, list) else [data]

    for rec in records:
        if not isinstance(rec, dict):
            continue

        rec_type = rec.get("type")
        type_counter[rec_type] += 1

        if rec_type != WEIGHT_TYPE:
            continue

        start_ms = rec.get("startTime")
        if start_ms is None:
            continue

        key = int(start_ms)
        if key in entries:
            continue

        sample_points = rec.get("samplePoints") or []
        raw_value = None
        for sp in sample_points:
            sp_key = sp.get("key", "")
            key_counter[sp_key] += 1
            if sp_key == WEIGHT_KEY:
                raw_value = sp.get("value")

        if raw_value is None:
            continue

        # value is a JSON-encoded string
        try:
            v = json.loads(raw_value) if isinstance(raw_value, str) else raw_value
        except json.JSONDecodeError:
            continue

        tz_str  = rec.get("timeZone", "+0000")
        try:
            tz_h = int(tz_str[:3])
            tz_m = int(tz_str[0] + tz_str[4:]) if len(tz_str) > 3 else 0
            offset_s = tz_h * 3600 + (abs(tz_m) * 60 * (1 if tz_h >= 0 else -1))
        except Exception:
            offset_s = 0

        utc_dt = datetime.fromtimestamp(key / 1000, tz=timezone.utc)
        local_ts = key + offset_s * 1000
        local_dt = datetime.fromtimestamp(local_ts / 1000, tz=timezone.utc)

        def pct(val):
            """Convert Huawei percentage (e.g. 20.5) to decimal (0.205)."""
            return round(val / 100, 4) if val is not None else None

        def opt(val):
            return round(float(val), 1) if val is not None else None

        entries[key] = {
            "typ":              "huawei",
            "datum":            local_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "zeit":             local_dt.strftime("%H:%M:%S"),
            "startTime":        key,
            "gewicht_kg":       opt(v.get("bodyWeight")),
            "koerperfett_pct":  pct(v.get("bodyFatRate")),
            "bmi":              opt(v.get("bmi")),
            "grundumsatz_kcal": opt(v.get("basalMetabolism")),
            "viszeralfett":     opt(v.get("visceralFatLevel")),
            "muskelmasse_kg":   opt(v.get("muscleMass")),
            "knochen_kg":       opt(v.get("boneSalt")),
            "protein_pct":      pct(v.get("protein")),
            "koerperwasser_pct": pct(v.get("moistureRate")),
            # Extra fields
            "koerperalter":     v.get("bodyAge"),
            "koerperscore":     opt(v.get("bodyScore")),
            "skelettmuskeln_kg": opt(v.get("skeletalMusclelMass")),
        }

# ── Summary ──────────────────────────────────────────────────────────────────
result = sorted(entries.values(), key=lambda x: x["startTime"])

print(f"Record types found across all files:")
for t, c in type_counter.most_common(10):
    marker = " <-- weight" if t == WEIGHT_TYPE else ""
    print(f"  type {t:>8}  {c:>6}x{marker}")

print(f"\nSamplePoint keys in weight records ({WEIGHT_TYPE}):")
for k, c in sorted(key_counter.items()):
    print(f"  {k:<50}  {c:>5}x")

print(f"\n[OK] {len(result)} weight entries -> {OUTPUT.name}")
if result:
    print(f"     Date range: {result[0]['datum'][:10]} to {result[-1]['datum'][:10]}")
    print(f"\nSample entry:")
    sample = {k: v for k, v in result[0].items() if k not in ("startTime", "typ")}
    for k, v in sample.items():
        print(f"  {k:<25} {v}")

OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
