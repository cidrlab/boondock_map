#!/usr/bin/env python3
"""Render the app icons from icons/icon.svg (VISION row 92).

Why this exists, and why the output is a *square*
-------------------------------------------------
The brand mark is a rounded square. Exported faithfully, that leaves the four
corners transparent — and a browser does not draw a favicon on your tab's dark
chrome, it composites it onto **white**. So a correctly-transparent icon shows
white corners on a dark tab, which is exactly the bug row 92 was meant to fix
and did not: the first attempt swapped an opaque-white export for a transparent
one, which looks right in an image viewer and identical in the tab.

The fix is to stop relying on transparency at all. Every PNG here is flattened
onto the mark's own navy, so the corners are navy rather than absent. The
rounded corner is still in the vector, it is simply navy-on-navy — which is
what you want anyway, because iOS and Android both apply their own mask to the
icon and a rounded source would get rounded twice.

Regenerate after any change to icon.svg:

    python3 web/scripts/build_icons.py
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / "public" / "icons"
SRC = ICONS / "icon.svg"

# The mark's own background (icon.svg's rect fill). Corners take this colour
# instead of transparency.
BACKDROP = (25, 34, 44, 255)   # #19222C

# 32 exists because the tab renders at 16–32 px and downscaling the 192 for it
# is mush; rendering that size straight from the vector stays crisp. It also
# happens to be a new filename, which is the only reliable way to get past how
# stubbornly browsers cache a favicon.
OUTPUTS = [
    ("icon-32.png", 32),
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon.png", 180),
]


def render(size, dest):
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), str(SRC), "-o", str(dest)],
        check=True,
    )


def main():
    if not SRC.is_file():
        sys.exit(f"missing {SRC}")
    for name, size in OUTPUTS:
        out = ICONS / name
        render(size, out)
        # Flatten onto the backdrop — this is the whole point of the script
        art = Image.open(out).convert("RGBA")
        flat = Image.new("RGBA", art.size, BACKDROP)
        flat.alpha_composite(art)
        flat.convert("RGB").save(out, "PNG", optimize=True)
        corner = Image.open(out).convert("RGBA").getpixel((0, 0))
        print(f"  {name:22} {size:>4}px  corner={corner}")
        if corner[3] != 255 or corner[:3] != BACKDROP[:3]:
            sys.exit(f"{name} corner is {corner}, expected opaque {BACKDROP} — the white-corner bug is back")


if __name__ == "__main__":
    main()
