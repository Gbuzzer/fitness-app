"""
merge_weight.py
Merges Honor Scale data (data.json, ends ~March 2020) with
Huawei Health weight data (weight_huawei.json, starts March 2020)
into a single chronological file: data/weight_merged.json

Rules:
- Union of both datasets, sorted by datum
- No deduplication (two measurements on same calendar day are kept)
- Percentage fields stored as decimals (< 1) so app.js ×100 logic still works
"""

import json
from pathlib import Path

ROOT     = Path(__file__).parent.parent          # Fitness-App/
HONOR    = ROOT / "data.json"
HUAWEI   = Path(__file__).parent / "weight_huawei.json"
OUTPUT   = Path(__file__).parent / "weight_merged.json"

honor_data  = json.loads(HONOR.read_text(encoding="utf-8"))
huawei_data = json.loads(HUAWEI.read_text(encoding="utf-8"))

print(f"Honor Scale entries: {len(honor_data)}")
print(f"  date range: {honor_data[0]['datum'][:10]} — {honor_data[-1]['datum'][:10]}")
print(f"Huawei entries:      {len(huawei_data)}")
print(f"  date range: {huawei_data[0]['datum'][:10]} — {huawei_data[-1]['datum'][:10]}")

# Mark source on each record (if not already set)
for r in honor_data:
    r.setdefault("quelle", "Honor Scale 2")

for r in huawei_data:
    r.setdefault("quelle", "Huawei Health")

merged = honor_data + huawei_data
merged.sort(key=lambda r: r["datum"])

print(f"\nMerged total:        {len(merged)}")
print(f"  date range: {merged[0]['datum'][:10]} — {merged[-1]['datum'][:10]}")

OUTPUT.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n[OK] -> {OUTPUT.name}")
