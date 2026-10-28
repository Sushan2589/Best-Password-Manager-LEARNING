"""Generate a local Latin subset; the original full font remains the fallback.

Optional maintenance tool, never run by build/CI:
  python -m pip install 'fonttools[woff]==4.67.0'
  python apps/web/scripts/subset-inter.py
"""
from hashlib import sha256
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

font_dir = Path(__file__).resolve().parents[1] / "src" / "app" / "fonts"
source = font_dir / "InterVariable.woff2"
if sha256(source.read_bytes()).hexdigest() != "693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3":
    raise SystemExit("Inter source changed: review source/license and update the provenance before regenerating.")

latin_ranges = [(0, 0xFF), (0x131, 0x131), (0x152, 0x153), (0x2BB, 0x2BC),
                (0x2C6, 0x2C6), (0x2DA, 0x2DA), (0x2DC, 0x2DC), (0x304, 0x304),
                (0x308, 0x308), (0x329, 0x329), (0x2000, 0x206F), (0x20AC, 0x20AC),
                (0x2122, 0x2122), (0x2191, 0x2191), (0x2193, 0x2193),
                (0x2212, 0x2212), (0x2215, 0x2215), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD)]
options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = ["*"]  # Preserve naming, copyright and license metadata.
options.name_languages = ["*"]
options.name_legacy = True
font = TTFont(source, recalcTimestamp=False)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=[code for start, end in latin_ranges for code in range(start, end + 1)])
subsetter.subset(font)
font.flavor = "woff2"
target = font_dir / "InterLatinVariable.woff2"
font.save(target)
font.close()
print(f"{target.name}: {target.stat().st_size} bytes, SHA-256 {sha256(target.read_bytes()).hexdigest()}")

# CSS ranges must match the generated subset. The full-font range is disjoint,
# preventing it from downloading while a Latin page's font is loading.
def css_ranges(ranges):
    return ",".join(f"U+{start:X}" if start == end else f"U+{start:X}-{end:X}" for start, end in ranges)

remaining = []
start = 0
for lower, upper in latin_ranges:
    if start < lower:
        remaining.append((start, lower - 1))
    start = upper + 1
remaining.append((start, 0x10FFFF))
print("Latin CSS:", css_ranges(latin_ranges))
print("Full fallback CSS:", css_ranges(remaining))
