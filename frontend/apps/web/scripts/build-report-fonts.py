#!/usr/bin/env python3
"""Generate the report PDF's static .ttf faces from the project's OWN woff2.

ZERO NETWORK EGRESS: reads the variable woff2 already vendored under
`node_modules/@fontsource-variable/*` and writes static .ttf into
`apps/web/public/fonts/`. The output is what `@react-pdf/renderer` embeds.

Run (from anywhere; uses uv's ephemeral env so nothing is installed globally):

    uv run --with "fonttools[woff]" --with brotli \
        python3 frontend/apps/web/scripts/build-report-fonts.py

WHY this exact recipe (hard-won — see the report-pdf foundation work):
  * @react-pdf's bundled fontkit CANNOT subset a fontTools-INSTANCED variable
    font (it renders blank glyphs or throws "Out of bounds access"). It CAN,
    however, read and subset a normal variable font and render its DEFAULT
    master. So we DO NOT instance: we keep the variable font intact and only
    shift each axis's `defaultValue` to the weight/optical-size we want, then
    let fontkit render that default. (Decomposing composites corrupts `gvar`,
    so we leave glyphs untouched.)
  * woff2 -> ttf is just `font.flavor = None` (decompress); no glyph changes.

All three families are SIL OFL (license files live beside the output).
"""

from __future__ import annotations

import glob
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent.parent / "public" / "fonts"
# node_modules may be hoisted under .bun/ (Bun) or a flat layout; search both.
ROOTS = [
    Path(__file__).resolve().parents[3] / "node_modules",
]


def find_source(family_dir: str, file_name: str) -> str:
    """Locate a vendored variable woff2 by family dir + file name.

    Handles both the Bun-hoisted layout (`node_modules/.bun/<pkg>@<ver>/
    node_modules/@fontsource-variable/<family>/files/...`) and a flat npm layout.
    """
    for root in ROOTS:
        tail = f"@fontsource-variable/{family_dir}/files/{file_name}"
        candidates = [
            f"{root}/.bun/*@fontsource-variable+{family_dir}*/node_modules/{tail}",
            f"{root}/{tail}",
        ]
        for pattern in candidates:
            hits = glob.glob(pattern)
            if hits:
                return hits[0]
    raise SystemExit(f"source font not found: {family_dir}/{file_name}")


def write_face(src: str, defaults: dict[str, float], out: str, family: str, sub: str) -> None:
    """woff2 -> ttf, shift fvar axis defaults to the target master, rename, save."""
    font = TTFont(src)
    font.flavor = None  # decompress woff2 -> plain TrueType
    for axis in font["fvar"].axes:
        if axis.axisTag in defaults:
            axis.defaultValue = max(axis.minValue, min(axis.maxValue, defaults[axis.axisTag]))
    name = font["name"]
    full = f"{family} {sub}"
    ids = [(1, family), (2, sub), (4, full), (6, full.replace(" ", "")), (16, family), (17, sub)]
    for name_id, value in ids:
        name.setName(value, name_id, 3, 1, 0x409)
        name.setName(value, name_id, 1, 0, 0)
    font.save(out)
    print("wrote", Path(out).name)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    fra = find_source("fraunces", "fraunces-latin-full-normal.woff2")
    fra_i = find_source("fraunces", "fraunces-latin-full-italic.woff2")
    han = find_source("hanken-grotesk", "hanken-grotesk-latin-wght-normal.woff2")
    spl = find_source("spline-sans-mono", "spline-sans-mono-latin-wght-normal.woff2")

    # Fraunces: high optical size (opsz=144) for an elegant display serif; clean
    # (SOFT=0, WONK=0). Two weights + an italic.
    write_face(fra, {"opsz": 144, "wght": 400, "SOFT": 0, "WONK": 0},
               str(OUT / "Fraunces-Regular.ttf"), "Fraunces Report", "Regular")
    write_face(fra, {"opsz": 144, "wght": 600, "SOFT": 0, "WONK": 0},
               str(OUT / "Fraunces-SemiBold.ttf"), "Fraunces Report", "SemiBold")
    write_face(fra_i, {"opsz": 144, "wght": 400, "SOFT": 0, "WONK": 0},
               str(OUT / "Fraunces-Italic.ttf"), "Fraunces Report", "Italic")

    # Hanken Grotesk: clean sans body in three weights.
    for wght, sub, name in [(400, "Regular", "HankenGrotesk-Report-Regular.ttf"),
                            (500, "Medium", "HankenGrotesk-Report-Medium.ttf"),
                            (600, "SemiBold", "HankenGrotesk-Report-SemiBold.ttf")]:
        write_face(han, {"wght": wght}, str(OUT / name), "Hanken Grotesk Report", sub)

    # Spline Sans Mono: tabular technical readouts (degrees, coordinates).
    write_face(spl, {"wght": 400}, str(OUT / "SplineSansMono-Regular.ttf"),
               "Spline Sans Mono Report", "Regular")
    write_face(spl, {"wght": 600}, str(OUT / "SplineSansMono-SemiBold.ttf"),
               "Spline Sans Mono Report", "SemiBold")

    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
