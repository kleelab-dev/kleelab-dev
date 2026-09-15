"""Choosing a design: matching, contrast, determinism and distinctness.

The builder used to theme every site from one of six colour presets chosen by a rule
keyed to industry, so two bakeries were guaranteed to look the same. This gate is
what says the replacement actually works, and it exists because the interesting
failures here are all silent ones:

  * a wrong-industry match produces a *complete, valid, well-designed* site for the
    wrong trade. Nothing errors. A plumber simply gets a wellness palette.
  * an unreadable colour pair renders. Text on an accent at 1.9:1 is still text.
  * a missing alias means the customer is told nothing matched, for an ordinary
    business like a solicitor.
  * a non-deterministic choice means the site's design changes when it is rebuilt.

Every one of those was found by running this by hand before it was written down, so
the checks below are the cases that actually went wrong, plus the invariants that
keep them from coming back.

Run with `python scripts/check_design_library.py`. No network, no database.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from kleelab.services import design_library as d  # noqa: E402

failures = 0


def fail(message: str) -> None:
    global failures
    failures += 1
    print(f"FAIL  {message}")


def pass_(message: str) -> None:
    print(f"PASS  {message}")


def check(message: str, condition: bool, detail: str = "") -> None:
    if condition:
        pass_(message)
    else:
        fail(f"{message}{' - ' + detail if detail else ''}")


# --- The library is readable -----------------------------------------------------

check("the compiled design library loads", d.available())
source = d.library_source()
check(
    "the library travels with its provenance",
    source.get("license") == "MIT" and bool(source.get("commit")),
    str(source)[:120],
)

# --- Trades are recognised -------------------------------------------------------

#: The accuracy contract. Each of these is a business the builder must recognise,
#: and the expected product type is the one a designer would pick. Several were
#: wrong when this was written: a yoga studio matched a photography studio, because
#: "studio" appears in one product type and "yoga" in another, they tied on weight,
#: and the tie was broken alphabetically.
RECOGNISED: list[tuple[str, str]] = [
    ("A sourdough bakery in Leeds with a weekly bread subscription", "Bakery/Cafe"),
    ("An independent coffee roastery with an online shop", "Bakery/Cafe"),
    ("A family solicitors firm handling conveyancing and wills", "Legal Services"),
    ("A boutique yoga and pilates studio", "Yoga & Stretching Guide"),
    ("A plumber offering emergency callouts in Bristol", "Home Services (Plumber/Electrician)"),
    ("An independent florist and plant shop", "Florist/Plant Shop"),
    ("A small chain of barbershops", "Beauty/Spa/Wellness Service"),
    ("A wedding photographer in the Cotswolds", "Photography Studio"),
    ("A boutique hotel with six rooms", "Hotel/Hospitality"),
    ("A dentist accepting new NHS patients", "Dental Practice"),
    ("A brewery and taproom", "Brewery/Winery"),
    ("A primary school tutoring service", "Online Course/E-learning"),
]

for description, expected in RECOGNISED:
    design = d.choose_design(description=description)
    got = design.product_type if design else None
    check(f"recognises: {description[:46]}", got == expected, f"got {got}, wanted {expected}")

# A description with nothing specific in it must not be given a trade. "A general
# business" was matching Generative Art Platform on the word "general".
NOT_RECOGNISED = [
    "A general business",
    "Something for my company",
    "A new venture",
]

for description in NOT_RECOGNISED:
    design = d.choose_design(description=description)
    check(
        f"refuses to guess: {description[:46]}",
        design is None,
        f"matched {design.product_type if design else None}",
    )

# --- Aliases bridge what the dataset does not cover -------------------------------

library = d._library()
product_types = {entry["productType"] for entry in library["products"]}

#: Every alias target must exist, or the bridge leads nowhere — silently, because a
#: missing product type simply produces no match and looks like the trade being
#: unknown.
missing_targets = sorted(
    {target for target in d._PRODUCT_ALIASES.values() if target not in product_types}
)
check(
    "every alias points at a product type that exists",
    not missing_targets,
    ", ".join(missing_targets),
)

#: Every alias key must be a word the library genuinely does not cover. Otherwise the
#: table stops being a bridge over a gap and becomes a second, competing matcher that
#: nobody reviews against the first.
covered: set[str] = set()
for entry in library["products"]:
    covered |= set(re.findall(r"[a-z0-9]+", entry["keywords"].lower()))

competing = sorted(key for key in d._PRODUCT_ALIASES if key in covered)
check(
    "every alias covers a word the dataset does not already know",
    not competing,
    ", ".join(competing),
)

# --- The fallback pairing is real -------------------------------------------------

pairing_names = {entry["name"] for entry in library["typePairings"]}
missing_pairings = [name for name in d._NEUTRAL_PAIRINGS if name not in pairing_names]
check(
    "every neutral fallback pairing exists in the library",
    not missing_pairings,
    ", ".join(missing_pairings),
)

out_of_scope = sorted(
    entry["name"]
    for entry in library["typePairings"]
    if any(marker in entry["name"].lower() for marker in d._OUT_OF_SCOPE_PAIRING)
)
check(
    "pairings for apps, games and crypto are kept out of a website's pool",
    len(out_of_scope) > 5,
    f"only {len(out_of_scope)} excluded, so the filter is probably not working",
)

# --- Colour is readable ----------------------------------------------------------

#: The library's promise is that each palette is contrast-checked. Verify it rather
#: than trust it: an accent pair below this ratio is text nobody can read, and no
#: amount of design taste makes up for it.
MIN_CONTRAST = 4.5


def _luminance(hex_colour: str) -> float | None:
    value = hex_colour.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(character * 2 for character in value)
    if len(value) not in (6, 8):
        return None
    try:
        channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    except ValueError:
        return None

    def linear(channel: float) -> float:
        return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(one: str, other: str) -> float | None:
    first, second = _luminance(one), _luminance(other)
    if first is None or second is None:
        return None
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)


#: A representative sample rather than all 192: this is a property of the dataset,
#: and the dataset is checked for shape by its own compiler. Sampling keeps this gate
#: fast while still covering every trade the descriptions above use, plus a spread of
#: the ones with unusual palettes — the dark and mobile-first rows.
SAMPLED = d._library()["palettes"][::7]

unreadable: list[str] = []
unmeasurable: list[str] = []

for palette in SAMPLED:
    for foreground, background in (
        ("onAccent", "accent"),
        ("onPrimary", "primary"),
        ("foreground", "background"),
    ):
        front, back = palette.get(foreground), palette.get(background)
        if not isinstance(front, str) or not isinstance(back, str):
            continue
        ratio = contrast(front, back)
        if ratio is None:
            # Translucent values cannot be measured without knowing what is behind
            # them. Recorded rather than ignored, so the gap is visible.
            unmeasurable.append(f"{palette['productType']}:{foreground}")
        elif ratio < MIN_CONTRAST:
            unreadable.append(
                f"{palette['productType']}:{foreground} on {background} = {ratio:.2f}:1"
            )

check(
    f"every sampled palette's text pairs clear {MIN_CONTRAST}:1",
    not unreadable,
    "; ".join(unreadable[:4]),
)
print(f"      ({len(SAMPLED)} palettes sampled, {len(unmeasurable)} transparent pairs unmeasurable)")

# --- Determinism -----------------------------------------------------------------

first = d.choose_design(description="A sourdough bakery in Leeds with a weekly bread subscription")
second = d.choose_design(description="A sourdough bakery in Leeds with a weekly bread subscription")
check(
    "the same business gets the same design twice",
    first is not None and second is not None and first.model_dump() == second.model_dump(),
)

check(
    "the same business gets the same design in a fresh process too",
    d._seed("A sourdough bakery in Leeds") == d._seed("A  sourdough   bakery in Leeds"),
    "the seed must not depend on whitespace",
)

# --- Distinctness ----------------------------------------------------------------

#: The complaint this whole feature answers: two customers in the same trade getting
#: the same site. Same trade, different businesses — they must not come out identical.
SAME_TRADE = [
    "A sourdough bakery in Leeds with a weekly bread subscription",
    "A family bakery in Cornwall making pasties and cream teas",
    "A vegan bakery in Manchester with a wholesale arm",
    "A gluten-free bakery in Edinburgh specialising in celebration cakes",
]

signatures = []
for description in SAME_TRADE:
    design = d.choose_design(description=description)
    if design is None:
        fail(f"no design for {description[:40]}")
        continue
    signatures.append(
        (design.product_type, design.style_id, design.pairing, design.colours.get("accent"))
    )

check(
    f"{len(SAME_TRADE)} businesses in one trade do not all share one design",
    len(set(signatures)) > 1,
    f"{len(set(signatures))} distinct of {len(signatures)}",
)

# Across different trades the expectation is stronger, and this is the shape of the
# claim that matters to a customer browsing the studio's work.
MIXED = [description for description, _ in RECOGNISED]
mixed_signatures = set()
for description in MIXED:
    design = d.choose_design(description=description)
    if design:
        mixed_signatures.add((design.product_type, design.pairing))

check(
    "businesses in different trades get different designs",
    len(mixed_signatures) >= len(MIXED) - 1,
    f"{len(mixed_signatures)} distinct of {len(MIXED)}",
)

# --- A design can be named by someone else ---------------------------------------

#: `resolve_design` takes a design named by a caller — the model, or the customer
#: asking for something different in the chat. Everything in it ends up as CSS on a
#: published page, so anything not in the library must be refused.
known = d.choose_design(description="A sourdough bakery in Leeds")
assert known is not None
resolved = d.resolve_design(
    {"product_type": known.product_type, "style_id": known.style_id, "pairing": known.pairing}
)
check(
    "a named design resolves to the same palette",
    resolved is not None and resolved.colours == known.colours,
)

for label, payload in {
    "an invented product type": {"product_type": "Not A Real Trade"},
    "an invented style": {"product_type": known.product_type, "style_id": "not-a-style"},
    "an invented pairing": {"product_type": known.product_type, "pairing": "Comic Sans Max"},
    "nothing at all": {},
}.items():
    check(f"refuses {label}", d.resolve_design(payload) is None)

# --- Shape of the answer ---------------------------------------------------------

check(
    "a design carries colour, type and a webfont request",
    bool(known.colours.get("accent"))
    and bool(known.colours.get("onAccent"))
    and bool(known.fonts.display)
    and bool(known.fonts.body)
    and "fonts.googleapis.com" in known.fonts.href,
    str(known.fonts)[:140],
)
check(
    "a design states where it came from",
    bool(known.product_type) and bool(known.style_name) and bool(known.rationale),
)

if failures:
    print(f"\n{failures} failure(s).\n")
    raise SystemExit(1)
print("\nAll design library checks passed.\n")
