"""Compile the vendored design library, and gate it.

The CSVs in `kleelab/design/data` are a snapshot of someone else's dataset, kept
verbatim so we can tell whether our copy still matches the release we took it from.
They are not what the product reads: this script turns them into one JSON file the
app loads, keeping only the fields that earn their place in a prompt or a token set.

It is also the gate. `python scripts/compile_design_library.py --check` writes
nothing and fails if:

  * a file has the wrong number of records - the dataset changed upstream
  * a required column is missing or renamed - the shape changed upstream
  * a key is duplicated, so a lookup would silently take the last one
  * a palette value is not something CSS can paint
  * a font used by a pairing has no licence record, or is on the excluded list
  * a `Decision_Rules` field is present but is not valid JSON
  * the compiled output differs from the file on disk - **drift**, which is what
    catches an edited CSV that was never recompiled

The last one is why this exists. A generated file that is committed will eventually
disagree with its source, and the disagreement is invisible until a prompt quietly
uses a stale value.

Run with `python scripts/compile_design_library.py` to write,
`--check` to verify.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA_DIR = ROOT / "src" / "kleelab" / "design" / "data"
OUT_FILE = ROOT / "src" / "kleelab" / "design" / "library.json"

#: Record counts this compiler expects.
#:
#: Deliberately hard numbers rather than "read whatever is there". An upstream
#: release that adds or drops rows is a change worth being told about, and a
#: silently shrinking dataset would show up as the builder gradually getting worse.
EXPECTED = {
    "palettes": 192,
    "typePairings": 74,
    "styles": 88,
    "products": 192,
    "reasoning": 192,
    "landingPatterns": 34,
    "uxRules": 119,
    "motion": 17,
}

#: Licence values that permit embedding in a commercial site.
#:
#: These are the dataset's own spellings - it writes `APACHE2`, not `Apache`. An
#: earlier version of this list used the friendly name and would have refused 35
#: perfectly good fonts.
ALLOWED_FONT_LICENCES = frozenset({"OFL", "APACHE2", "UFL"})

#: Something a browser can paint.
#:
#: Not a hex-only check, because twenty of the palettes - the dark-mode app ones -
#: use `rgba(255, 255, 255, 0.08)` for their hairline border. That is a legitimate
#: colour, and it is the only non-hex value in the whole dataset. The rule here is
#: about what CSS accepts, which is a fact about browsers rather than about our
#: frontend, so restating it is not the kind of duplication this project avoids.
COLOUR = re.compile(
    r"^(#[0-9A-Fa-f]{3,8}"
    r"|rgba?\(|hsla?\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|var\()"
)

SOURCE_FILES = [
    "colors.csv",
    "typography.csv",
    "styles.csv",
    "products.csv",
    "ui-reasoning.csv",
    "landing.csv",
    "ux-guidelines.csv",
    "motion.csv",
    "google-font-licenses.json",
]

_problems: list[str] = []


def bad(message: str) -> None:
    _problems.append(message)


def read_rows(name: str, required: tuple[str, ...]) -> list[dict[str, str]]:
    """Rows of `name`, with the columns we need present.

    A missing column must be loud. A silently empty string would sail straight
    through into a prompt as a blank line, which reads as the model ignoring an
    instruction rather than as the data having moved.
    """
    path = DATA_DIR / name
    if not path.exists():
        bad(f"{name}: not found in the vendored dataset")
        return []

    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        if not header:
            bad(f"{name}: no header row")
            return []

        absent = [column for column in required if column not in header]
        if absent:
            bad(
                f"{name}: missing column(s) {', '.join(absent)}. The upstream dataset has changed "
                "shape; read the new columns and decide what should map to what before updating "
                "this list."
            )
            return []

        rows = []
        for index, row in enumerate(reader, start=2):
            if None in row:
                bad(
                    f"{name} line {index}: more fields than the header has. A quoting or escaping "
                    "problem looks exactly like this."
                )
                continue
            rows.append({key: (value or "").strip() for key, value in row.items()})
        return rows


def expect_count(label: str, actual: int, expected: int) -> None:
    if actual != expected:
        bad(f"{label}: expected {expected} records, found {actual}")


def expect_unique(label: str, values: list[str]) -> None:
    """Fail on duplicates rather than letting the last one silently win a lookup."""
    seen: dict[str, int] = {}
    for value in values:
        seen[value] = seen.get(value, 0) + 1
    duplicated = [value for value, count in seen.items() if count > 1]
    if duplicated:
        shown = ", ".join(duplicated[:5])
        bad(f"{label}: duplicate key(s) {shown}{'…' if len(duplicated) > 5 else ''}")


def expect_colour(label: str, value: str) -> None:
    if not COLOUR.match(value):
        bad(f'{label}: "{value}" is not something CSS can paint')


def digest(name: str) -> str:
    path = DATA_DIR / name
    if not path.exists():
        return ""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decision_rules(label: str, value: str) -> dict[str, list[str]] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        bad(f"{label}: decision rules are present but not valid JSON")
        return None
    if not isinstance(parsed, dict):
        bad(f"{label}: decision rules parsed as {type(parsed).__name__}, expected an object")
        return None
    return parsed


# --- Palettes -------------------------------------------------------------------

COLOUR_COLUMNS = [
    "Primary",
    "On Primary",
    "Secondary",
    "On Secondary",
    "Accent",
    "On Accent",
    "Background",
    "Foreground",
    "Card",
    "Card Foreground",
    "Muted",
    "Muted Foreground",
    "Border",
    "Destructive",
    "On Destructive",
    "Ring",
]


def compile_palettes() -> list[dict[str, Any]]:
    rows = read_rows("colors.csv", ("Product Type", *COLOUR_COLUMNS))
    expect_count("palettes", len(rows), EXPECTED["palettes"])

    palettes = []
    for row in rows:
        product_type = row["Product Type"]
        entry: dict[str, Any] = {"productType": product_type}
        for column in COLOUR_COLUMNS:
            key = column.split()[0].lower() + "".join(
                word.capitalize() for word in column.split()[1:]
            )
            entry[key] = row[column]
            expect_colour(f"palettes/{product_type}.{key}", row[column])
        entry["notes"] = row.get("Notes", "")
        palettes.append(entry)

    expect_unique("palettes", [entry["productType"] for entry in palettes])
    return palettes


# --- Type pairings and font licences ---------------------------------------------


def compile_type_pairings() -> list[dict[str, str]]:
    rows = read_rows(
        "typography.csv",
        ("Font Pairing Name", "Heading Font", "Body Font", "Mood/Style Keywords", "Best For"),
    )
    expect_count("typePairings", len(rows), EXPECTED["typePairings"])

    pairings = [
        {
            "name": row["Font Pairing Name"],
            "category": row.get("Category", ""),
            "heading": row["Heading Font"],
            "body": row["Body Font"],
            "mood": row["Mood/Style Keywords"],
            "bestFor": row["Best For"],
            "url": row.get("Google Fonts URL", ""),
        }
        for row in rows
    ]

    expect_unique("typePairings", [entry["name"] for entry in pairings])
    for pairing in pairings:
        if not pairing["heading"] or not pairing["body"]:
            bad(f"typePairings/{pairing['name']}: missing a heading or body font")
    return pairings


def compile_font_licences(pairings: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    raw = json.loads((DATA_DIR / "google-font-licenses.json").read_text(encoding="utf-8"))

    excluded = {entry["name"] for entry in raw["excludedFamilies"]}
    by_name = {entry["name"]: entry for entry in raw["families"]}

    wanted = sorted({pairing[role] for pairing in pairings for role in ("heading", "body")})
    families: list[dict[str, str]] = []

    for family in wanted:
        if family in excluded:
            # The dataset's own promotion policy refuses these; using one would mean
            # serving a font whose licence we cannot state.
            bad(f'font "{family}": on the excluded list, so its licence cannot be stated')
            continue
        entry = by_name.get(family)
        if entry is None:
            bad(
                f'font "{family}": no licence record. It is used by a pairing, so it cannot be '
                "shipped unverified."
            )
            continue
        if entry["license"] not in ALLOWED_FONT_LICENCES:
            bad(f'font "{family}": licence "{entry["license"]}" is not one this project ships')
            continue
        families.append({"family": family, "license": entry["license"]})

    return families, raw["familyCount"]


# --- Styles ---------------------------------------------------------------------


def compile_styles() -> list[dict[str, str]]:
    rows = read_rows(
        "styles.csv",
        (
            "Style Category",
            "Style ID",
            "Status",
            "Best For",
            "Do Not Use For",
            "AI Prompt Keywords",
            "Design System Variables",
            "Accessibility",
            "Preferred Mode",
        ),
    )
    expect_count("styles", len(rows), EXPECTED["styles"])

    styles = [
        {
            "id": row["Style ID"],
            "name": row["Style Category"],
            "type": row.get("Type", ""),
            "keywords": row.get("Keywords", ""),
            "primaryColors": row.get("Primary Colors", ""),
            "secondaryColors": row.get("Secondary Colors", ""),
            "effects": row.get("Effects & Animation", ""),
            "bestFor": row["Best For"],
            "doNotUseFor": row["Do Not Use For"],
            "era": row.get("Era/Origin", ""),
            "complexity": row.get("Complexity", ""),
            "lightMode": row.get("Light Mode ✓", ""),
            "darkMode": row.get("Dark Mode ✓", ""),
            # Machine-readable, and enforced rather than merely displayed: the tokens
            # a style declares are what the recipe kit is themed with.
            "variables": row["Design System Variables"],
            "accessibility": row["Accessibility"],
            "performance": row.get("Performance", ""),
            "mobileFriendly": row.get("Mobile-Friendly", ""),
            "conversionFocused": row.get("Conversion-Focused", ""),
            "promptKeywords": row["AI Prompt Keywords"],
            "status": row["Status"],
            "preferredMode": row["Preferred Mode"],
        }
        for row in rows
    ]

    expect_unique("styles", [entry["id"] for entry in styles])
    for style in styles:
        if not style["id"]:
            bad(f"styles/{style['name']}: no Style ID, so it cannot be referenced")
        if not style["variables"]:
            bad(f"styles/{style['id']}: no design system variables, so it cannot theme a page")
    return styles


# --- Products, reasoning, patterns, rules ----------------------------------------


def compile_products() -> list[dict[str, str]]:
    rows = read_rows(
        "products.csv",
        (
            "Product Type",
            "Keywords",
            "Primary Style Recommendation",
            "Landing Page Pattern",
            "Color Palette Focus",
        ),
    )
    expect_count("products", len(rows), EXPECTED["products"])

    products = [
        {
            "productType": row["Product Type"],
            "keywords": row.get("Keywords", ""),
            "primaryStyle": row["Primary Style Recommendation"],
            "secondaryStyles": row.get("Secondary Styles", ""),
            "landingPattern": row["Landing Page Pattern"],
            "paletteFocus": row["Color Palette Focus"],
            "considerations": row.get("Key Considerations", ""),
        }
        for row in rows
    ]

    expect_unique("products", [entry["productType"] for entry in products])
    return products


def compile_reasoning() -> list[dict[str, Any]]:
    rows = read_rows(
        "ui-reasoning.csv",
        (
            "UI_Category",
            "Recommended_Pattern",
            "Style_Priority",
            "Color_Mood",
            "Typography_Mood",
            "Decision_Rules",
            "Anti_Patterns",
            "Severity",
        ),
    )
    expect_count("reasoning", len(rows), EXPECTED["reasoning"])

    reasoning = [
        {
            "category": row["UI_Category"],
            "recommendedPattern": row["Recommended_Pattern"],
            "stylePriority": row["Style_Priority"],
            "colorMood": row["Color_Mood"],
            "typographyMood": row["Typography_Mood"],
            "keyEffects": row.get("Key_Effects", ""),
            "decisionRules": decision_rules(
                f"reasoning/{row['UI_Category']}", row["Decision_Rules"]
            ),
            "antiPatterns": row["Anti_Patterns"],
            "severity": row["Severity"],
        }
        for row in rows
    ]

    expect_unique("reasoning", [entry["category"] for entry in reasoning])
    return reasoning


def compile_landing_patterns() -> list[dict[str, str]]:
    rows = read_rows(
        "landing.csv",
        (
            "Pattern Name",
            "Pattern ID",
            "Keywords",
            "Section Order",
            "Primary CTA Placement",
            "Conversion Optimization",
        ),
    )
    expect_count("landingPatterns", len(rows), EXPECTED["landingPatterns"])

    patterns = [
        {
            "id": row["Pattern ID"],
            "name": row["Pattern Name"],
            "keywords": row["Keywords"],
            "sectionOrder": row["Section Order"],
            "ctaPlacement": row["Primary CTA Placement"],
            "colorStrategy": row.get("Color Strategy", ""),
            "effects": row.get("Recommended Effects", ""),
            "conversionNotes": row["Conversion Optimization"],
        }
        for row in rows
    ]

    expect_unique("landingPatterns", [entry["id"] for entry in patterns])
    for pattern in patterns:
        if not pattern["id"]:
            bad(f"landingPatterns/{pattern['name']}: no Pattern ID")
    return patterns


def compile_ux_rules() -> list[dict[str, str]]:
    rows = read_rows(
        "ux-guidelines.csv",
        ("Category", "Issue", "Platform", "Description", "Do", "Don't", "Severity"),
    )
    expect_count("uxRules", len(rows), EXPECTED["uxRules"])

    return [
        {
            "category": row["Category"],
            "issue": row["Issue"],
            "platform": row["Platform"],
            "description": row["Description"],
            "do": row["Do"],
            "dont": row["Don't"],
            "severity": row["Severity"],
        }
        for row in rows
    ]


def compile_motion() -> list[dict[str, str]]:
    rows = read_rows(
        "motion.csv",
        ("Category", "Intensity Tier", "Keywords", "Trigger", "Duration", "Easing"),
    )
    expect_count("motion", len(rows), EXPECTED["motion"])

    return [
        {
            "category": row["Category"],
            "tier": row["Intensity Tier"],
            "keywords": row["Keywords"],
            "trigger": row["Trigger"],
            "duration": row["Duration"],
            "easing": row["Easing"],
            "do": row.get("Do", ""),
            "dont": row.get("Don't", ""),
        }
        for row in rows
    ]


def compile_library() -> dict[str, Any]:
    palettes = compile_palettes()
    type_pairings = compile_type_pairings()
    styles = compile_styles()
    products = compile_products()
    reasoning = compile_reasoning()
    landing_patterns = compile_landing_patterns()
    ux_rules = compile_ux_rules()
    motion = compile_motion()
    fonts, family_count = compile_font_licences(type_pairings)

    return {
        # Provenance travels with the data so a running build can always say where its
        # design knowledge came from, and whether it still matches the release we took.
        "source": {
            "dataset": "ui-ux-pro-max",
            "repository": "https://github.com/affaan-m/ECC",
            "version": "2.2.0",
            "commit": "ae303fb6c19e3f7cb88cb9fd9f15ddcf235294b6",
            "license": "MIT",
            "copyright": "Copyright (c) 2026 Affaan Mustafa",
            "notices": "THIRD-PARTY-NOTICES.md",
            "familiesVerified": family_count,
            "files": {name: digest(name) for name in SOURCE_FILES},
        },
        "counts": {
            "palettes": len(palettes),
            "typePairings": len(type_pairings),
            "styles": len(styles),
            "products": len(products),
            "reasoning": len(reasoning),
            "landingPatterns": len(landing_patterns),
            "uxRules": len(ux_rules),
            "motion": len(motion),
            "fontFamilies": len(fonts),
        },
        "palettes": palettes,
        "typePairings": type_pairings,
        "styles": styles,
        "products": products,
        "reasoning": reasoning,
        "landingPatterns": landing_patterns,
        "uxRules": ux_rules,
        "motion": motion,
        "fonts": fonts,
    }


def main() -> int:
    library = compile_library()

    if _problems:
        print(f"\nThe vendored design data failed {len(_problems)} check(s):\n", file=sys.stderr)
        for problem in _problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "\nNothing was written. These are the dataset changing shape, not a bug in the app -\n"
            "read the upstream file and decide what the new shape should map to.\n",
            file=sys.stderr,
        )
        return 1

    serialised = json.dumps(library, indent=1, ensure_ascii=False, sort_keys=False) + "\n"

    if "--check" in sys.argv:
        existing = OUT_FILE.read_text(encoding="utf-8") if OUT_FILE.exists() else ""
        if existing != serialised:
            print(
                "\nThe compiled design library is out of date with the vendored data.\n"
                "Run `python scripts/compile_design_library.py` and commit the result.\n",
                file=sys.stderr,
            )
            return 1
        counts = library["counts"]
        print(
            "Design data OK - "
            f"{counts['palettes']} palettes, {counts['typePairings']} pairings, "
            f"{counts['styles']} styles, {counts['uxRules']} rules, "
            f"{counts['fontFamilies']} licensed fonts."
        )
        return 0

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(serialised, encoding="utf-8")

    print("Compiled the design library.")
    for key, value in library["counts"].items():
        print(f"  {key:<16} {value}")
    print(f"\nWrote {len(serialised.encode('utf-8')) / 1024:.0f}kb to {OUT_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
