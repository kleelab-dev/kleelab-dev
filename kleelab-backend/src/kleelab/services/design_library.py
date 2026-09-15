"""Choosing how a site should look.

The builder used to theme a site by picking one of six colour presets, chosen by a
hand-written rule keyed to industry — "warm for food, drink, hospitality". That
gave every bakery in the country the same eight hex values, and there was nothing
else to vary: type, spacing and shape were fixed classes.

This chooses from the design library instead. A business description is matched to a
product type, and that product type brings a curated palette, a set of styles and a
typography mood with it. A deterministic seed then picks among the suitable
options, so two bakeries get two different — but both appropriate — designs, while
one business keeps the same design every time its site is rebuilt.

Three decisions worth stating plainly:

* **The palette is curated, not generated.** Every palette in the library ships with
  its own `On Primary`, `On Accent`, `Card Foreground` and `Muted Foreground` values
  chosen against its own background. Generating colours produces combinations
  nobody has checked; these have been. That is why the accent contrast slot exists.
* **The choice is seeded, not random.** `random` seeded from a hash of the business
  description means the same input always yields the same design. A design that
  reshuffled on every rebuild would make the builder unusable — and untestable.
* **Only two things are parsed out of the library's prose.** The style's
  `Design System Variables` column is written for a human, and interpreting more of
  it than corner shape and shadow weight would be guessing. The rest of the style is
  context for a prompt, not something to mechanically apply.
"""

from __future__ import annotations

import hashlib
import json
import random
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from kleelab.schemas.ai import Design

__all__ = [
    "available",
    "choose_design",
    "library_source",
    "match_product",
    "resolve_design",
]

LIBRARY_PATH = Path(__file__).resolve().parent.parent / "design" / "library.json"

#: Words too common to say anything about a business.
#:
#: The second group is the one that matters: adjectives a customer reaches for
#: without meaning anything by them. "A general business" matched Generative Art
#: Platform on the word "general", which is a wrong-industry answer produced by a
#: word with no industry in it. Note what is *not* here — "mobile", "luxury" and
#: "premium" all describe a real kind of business and are left in.
_STOPWORDS = frozenset(
    """
    a an and are as at be by for from has have in is it its of on or that the their
    them they this to was were will with we you your our my me i
    site website page pages business company shop store online small local
    general independent boutique professional quality trusted friendly reliable
    experienced leading premier bespoke specialist dedicated comprehensive
    established passionate innovative dynamic award winning
    new venture idea project thing help need want looking based
    """.split()
)

#: Radius and shadow are the only two style variables read mechanically. Both are
#: unambiguous in the source — a corner is either square or not — and both change a
#: page's character enough to be worth having. Everything else in that column is
#: prose for a prompt.
_SHARP_RADIUS = re.compile(r"--border-radius\s*:\s*0(px|rem|em)?\s*(,|$)", re.IGNORECASE)
_NO_SHADOW = re.compile(r"--shadow\s*:\s*none", re.IGNORECASE)

#: Trades the dataset does not name, mapped to the product type that serves them.
#:
#: Recorded rather than hidden, because a coffee roastery with no design at all is a
#: worse outcome than one dressed as the cafe next door, and "solicitor" returning
#: nothing made the builder look broken for a very ordinary business. These are
#: bridges over gaps in someone else's vocabulary, and two tests keep them honest:
#: every key must be a word the library genuinely does not cover (so this never
#: competes with the matcher), and every target must exist (so a rename upstream
#: fails loudly instead of silently matching nothing).
_PRODUCT_ALIASES: dict[str, str] = {
    # Food and drink.
    "coffee": "Bakery/Cafe",
    "roastery": "Bakery/Cafe",
    "espresso": "Bakery/Cafe",
    "teashop": "Bakery/Cafe",
    "patisserie": "Bakery/Cafe",
    "delicatessen": "Bakery/Cafe",
    "brunch": "Bakery/Cafe",
    "catering": "Restaurant/Food Service",
    "caterer": "Restaurant/Food Service",
    "bistro": "Restaurant/Food Service",
    "brasserie": "Restaurant/Food Service",
    "pub": "Brewery/Winery",
    "taproom": "Brewery/Winery",
    "distillery": "Brewery/Winery",
    # Trades and home services.
    "plumbing": "Home Services (Plumber/Electrician)",
    "boiler": "Home Services (Plumber/Electrician)",
    "heating": "Home Services (Plumber/Electrician)",
    "joinery": "Home Services (Plumber/Electrician)",
    "joiner": "Home Services (Plumber/Electrician)",
    "carpenter": "Home Services (Plumber/Electrician)",
    "roofing": "Construction/Architecture",
    "roofer": "Construction/Architecture",
    "plasterer": "Construction/Architecture",
    "decorator": "Home Decoration & Interior Design",
    "locksmith": "Home Services (Plumber/Electrician)",
    "removals": "Logistics/Delivery",
    "mechanic": "Automotive/Car Dealership",
    # Professional services.
    "solicitor": "Legal Services",
    "solicitors": "Legal Services",
    "conveyancing": "Legal Services",
    "barrister": "Legal Services",
    "notary": "Legal Services",
    "recruiter": "Job Board/Recruitment",
    "bookkeeping": "Invoice & Billing Tool",
    "mortgage": "Insurance Platform",
    # Health, care and wellbeing.
    "dentist": "Dental Practice",
    "orthodontist": "Dental Practice",
    "physiotherapy": "Medical Clinic",
    "chiropractor": "Medical Clinic",
    "osteopath": "Medical Clinic",
    "barber": "Beauty/Spa/Wellness Service",
    "barbershop": "Beauty/Spa/Wellness Service",
    "hairdresser": "Beauty/Spa/Wellness Service",
    "hairdressing": "Beauty/Spa/Wellness Service",
    "beautician": "Beauty/Spa/Wellness Service",
    "nails": "Beauty/Spa/Wellness Service",
    "childminder": "Childcare/Daycare",
    "carer": "Senior Care/Elderly",
    "homecare": "Senior Care/Elderly",
    # Retail, property and community.
    "floristry": "Florist/Plant Shop",
    "greengrocer": "Florist/Plant Shop",
    "butcher": "Bakery/Cafe",
    "lettings": "Real Estate/Property",
    "landlord": "Real Estate/Property",
    "surveyor": "Real Estate/Property",
    "bridal": "Wedding/Event Planning",
    "weddings": "Wedding/Event Planning",
    "venues": "Event Management",
    "fundraising": "Non-profit/Charity",
    "parish": "Church/Religious Organization",
    "tuition": "Online Course/E-learning",
    "tutoring": "Online Course/E-learning",
    "tours": "Travel/Tourism Agency",
    "excursions": "Travel/Tourism Agency",
}

#: An alias must beat any keyword match. These exist precisely for trades the
#: keyword lists miss, so a stray shared word must not outrank a deliberate entry.
_ALIAS_BONUS = 10.0

#: The score a match must reach on its own. Position in a keyword list rank-weights a
#: match, which is right for choosing between product types and wrong for deciding
#: whether there is a match at all — `hotel` sits second in one list and scores 0.25,
#: which is a weak score and a perfectly clear answer.
_MIN_MATCH = 1.0

#: How many product types a keyword may appear in and still count as distinctive.
#:
#: A match is accepted when the description names at least one keyword this rare.
#: `hotel` appears twice and is a real answer; `shop` appears four times and is not a
#: trade, it is a word. This is the rule that decides whether a design is chosen at
#: all, so it is deliberately about how specific the customer was rather than how
#: high anything scored.
_DISTINCTIVE_MAX = 3

#: How many leading characters two words must share to be treated as the same word.
#:
#: The library lists nouns, and a customer writes whatever comes naturally: the
#: keyword is `photography` and the description says `photographer`, the keyword is
#: `hotel` and the description says `hotels`. Five characters separates those from
#: genuine near-misses — `care` and `career` differ at the fourth — which matters
#: because a false match is a wrong industry, not a missed one.
_STEM_LENGTH = 5

#: Pairings to use when nothing about the business points to one.
#:
#: Named explicitly, and asserted to exist by the test, because the alternative -
#: choosing from all 74 - handed a firm of solicitors a Web3/DeFi typeface. These
#: three are the library's own general-purpose pairs.
_NEUTRAL_PAIRINGS = ("Modern Professional", "Geometric Modern", "Premium Sans (DM Sans)")

#: Pairings that describe something other than a small business website.
#:
#: The library spans websites, mobile apps, games and crypto products. KleeLab builds
#: websites for small businesses, so a face nominated for a mobile app or a
#: blockchain dashboard is not a candidate however well its mood words happen to
#: overlap. Without this a florist was offered Cyberpunk and a firm of solicitors was
#: offered Web3/DeFi — the words "modern" and "bold" appear in a great many of these
#: rows and will always find something to match on.
_OUT_OF_SCOPE_PAIRING = (
    "mobile",
    "app",
    "cli",
    "terminal",
    "sci-fi",
    "cyberpunk",
    "pixel",
    "nft",
    "web3",
    "crypto",
    "defi",
    "brutalist",
    "brutalism",
    "game",
    "arcade",
    "neon",
)

#: The score a pairing must reach to be used. Below it, the neutral list is safer
#: than a typographic opinion formed from one incidental shared word.
_MIN_PAIRING_SCORE = 0.5


@lru_cache(maxsize=1)
def _library() -> dict[str, Any]:
    """The compiled design library.

    Read once and held. It is 562kb of reference data that never changes while the
    process runs, and re-reading it per request would be the only thing this module
    does expensively.
    """

    return json.loads(LIBRARY_PATH.read_text(encoding="utf-8"))


def available() -> bool:
    """Whether the library compiled and is readable. A missing file is not fatal."""

    try:
        return bool(_library().get("palettes"))
    except (OSError, ValueError):
        return False


def library_source() -> dict[str, Any]:
    """Provenance, for the notice the build needs to carry."""

    try:
        return dict(_library().get("source", {}))
    except (OSError, ValueError):
        return {}


# --- Matching --------------------------------------------------------------------


def _words(text: str) -> set[str]:
    found = re.findall(r"[a-z0-9]+", text.lower())
    return {word for word in found if word not in _STOPWORDS and len(word) > 2}


def _ordered_keywords(text: str) -> list[str]:
    """A keyword list in the order it is written, deduplicated.

    The order carries real information: the library lists a product type's keywords
    most-identifying first — `bakery, cafe`, `yoga, stretch, flexibility`. Keeping it
    is what stops a word like "studio", which appears low down in one list, from
    tying with "yoga", which is the whole identity of another. Flat sets threw that
    signal away, and two businesses then tied and were separated alphabetically.
    """

    ordered: list[str] = []
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        if word in _STOPWORDS or len(word) <= 2 or word in ordered:
            continue
        ordered.append(word)
    return ordered


def _product_alias_for(word: str) -> str | None:
    """The alias a description word refers to, allowing for plural and suffix forms.

    An exact lookup missed "barbershops" for an alias written as "barber", which is
    the difference between a trade being recognised and a customer being told the
    builder does not know what a barber is. Only prefixes of at least five
    characters are accepted, so short keys cannot start matching unrelated words.
    """

    exact = _PRODUCT_ALIASES.get(word)
    if exact:
        return exact

    for key, target in _PRODUCT_ALIASES.items():
        if len(key) >= 5 and word.startswith(key):
            return target

    return None


def _normalise(text: str) -> str:
    """Lowercase, and strip everything that differs between how two lists spell the
    same style. `Minimalism & Swiss Style` and `Minimalism and Swiss Style` are one
    style, and a matcher that cannot see that will silently fall back to defaults."""

    without_joins = re.sub(r"\b(and|plus|with)\b", " ", text.lower())
    return re.sub(r"[^a-z0-9]+", " ", without_joins).strip()


def match_product(description: str) -> dict[str, Any] | None:
    """The product type this business looks most like.

    One pass of keyword scoring, weighted twice. By how rare a keyword is, so that a
    shared "service" counts for little and a shared "sourdough" counts for a lot; and
    by how high it sits in the product type's own list, so that its stated identity
    beats an incidental overlap.

    A deliberate alias for a trade the dataset does not name outranks all of it.

    Returns `None` when nothing clears the floor, which the caller must handle by
    leaving the site on the neutral default rather than dressing it in a design
    chosen from the wrong trade.
    """

    if not description.strip():
        return None

    description_words = _words(description)
    if not description_words:
        return None

    products = _library().get("products", [])
    by_type = {product["productType"]: product for product in products}

    # How many product types each keyword appears in, so a rare keyword counts for
    # more than a common one.
    frequency: dict[str, int] = {}
    for product in products:
        for keyword in set(_ordered_keywords(product.get("keywords", ""))):
            frequency[keyword] = frequency.get(keyword, 0) + 1

    scores: dict[str, float] = {}
    rarest: dict[str, int] = {}

    # A description word and a keyword count as the same word when they share a
    # stem, so `photographer` finds `photography` and `hotels` finds `hotel`.
    stems = {word[:_STEM_LENGTH] for word in description_words if len(word) >= _STEM_LENGTH}

    def shares(word: str) -> bool:
        if word in description_words:
            return True
        return len(word) >= _STEM_LENGTH and word[:_STEM_LENGTH] in stems

    for product in products:
        product_type = product["productType"]
        keywords = _ordered_keywords(product.get("keywords", ""))
        score = 0.0
        for position, keyword in enumerate(keywords):
            if not shares(keyword):
                continue
            seen_in = frequency.get(keyword, 1)
            score += (1.0 / seen_in) * (1.0 / (1 + position))
            if seen_in < rarest.get(product_type, _DISTINCTIVE_MAX + 1):
                rarest[product_type] = seen_in
        if score > 0:
            scores[product_type] = score

    for word in description_words:
        target = _product_alias_for(word)
        if target and target in by_type:
            scores[target] = scores.get(target, 0.0) + _ALIAS_BONUS
            rarest[target] = 0

    if not scores:
        return None

    # Eligible means the customer named something specific to this trade, or the
    # match was strong enough to be clear regardless.
    eligible = [
        entry
        for entry in scores.items()
        if rarest.get(entry[0], 99) <= _DISTINCTIVE_MAX or entry[1] >= _MIN_MATCH
    ]
    if not eligible:
        return None

    # Highest score wins; the name only breaks a genuine tie, never in place of the
    # signal, which is what alphabetical ordering used to do.
    best_type = min(eligible, key=lambda entry: (-entry[1], entry[0]))
    return by_type[best_type[0]]


def _palette_for(product_type: str) -> dict[str, Any] | None:
    for palette in _library().get("palettes", []):
        if palette["productType"] == product_type:
            return palette
    return None


def _styles_named(text: str) -> list[dict[str, Any]]:
    """Style records named in a `Primary Style Recommendation`-style string.

    The library writes those as `Glassmorphism + Flat Design` or
    `Soft UI Evolution , Minimalism & Swiss Style`, so the string is split on its
    separators and each fragment matched against the style names and ids.
    """

    library = _library()
    fragments = [fragment for fragment in re.split(r"[+,;]| and ", text) if fragment.strip()]
    found: list[dict[str, Any]] = []

    for fragment in fragments:
        wanted = _normalise(fragment)
        if not wanted:
            continue
        for style in library.get("styles", []):
            if style["id"] in {entry["id"] for entry in found}:
                continue
            names = {_normalise(style["name"]), _normalise(style["id"])}
            if any(name == wanted or wanted in name or name in wanted for name in names):
                found.append(style)
                break

    return found


def _candidate_pairings(product: dict[str, Any], description: str) -> list[dict[str, Any]]:
    """Pairings whose stated purpose overlaps this business, best fit first.

    Scored by rarity for the same reason the product matcher is: words like "modern"
    and "professional" appear across most of these rows and carry no information,
    while "conveyancing" or "florist" appear in one and settle the question.

    Falls back to a short reviewed list rather than to the whole library. Every
    pairing here is a professional pairing, but a pairing chosen for the wrong trade
    is worse than one chosen for no trade at all.
    """

    library = _library()
    pairings = [
        pairing
        for pairing in library.get("typePairings", [])
        if not any(
            marker in pairing["name"].lower() for marker in _OUT_OF_SCOPE_PAIRING
        )
    ]
    if not pairings:
        return []

    frequency: dict[str, int] = {}
    for pairing in pairings:
        for word in _words(f"{pairing.get('bestFor', '')} {pairing.get('mood', '')}"):
            frequency[word] = frequency.get(word, 0) + 1

    wanted = _words(
        f"{description} {product.get('productType', '')} {product.get('paletteFocus', '')}"
    )

    scored: list[tuple[float, str, dict[str, Any]]] = []
    for pairing in pairings:
        haystack = _words(f"{pairing.get('bestFor', '')} {pairing.get('mood', '')}")
        score = sum(1.0 / frequency.get(word, 1) for word in wanted & haystack)
        if score >= _MIN_PAIRING_SCORE:
            scored.append((score, pairing["name"], pairing))

    if not scored:
        neutral = [
            pairing
            for name in _NEUTRAL_PAIRINGS
            for pairing in pairings
            if pairing["name"] == name
        ]
        # `or list(pairings)` rather than an empty list: a site with no typographic
        # choice at all is the failure this module exists to prevent.
        return neutral or list(pairings)

    # Sorted by score, then by name so equal scores never depend on file order.
    scored.sort(key=lambda entry: (-entry[0], entry[1]))
    return [pairing for _, _, pairing in scored]


def _seed(description: str) -> int:
    """A stable integer for a business description.

    `hashlib` rather than `hash()`, which is randomised per process — a design that
    changed between two runs of the same request would be impossible to reason about
    and impossible to test.
    """

    normalised = " ".join(description.lower().split())
    return int.from_bytes(hashlib.sha256(normalised.encode("utf-8")).digest()[:8], "big")


# --- Building the design ---------------------------------------------------------

#: Library palette column -> theme slot.
#:
#: `mint` is a soft wash used behind alternating bands, and the library's nearest
#: equivalent is its muted tone. `ink` is the strong foreground and `paper` the page
#: background, so a dark palette inverts both together and text on an ink-filled band
#: stays readable — which is why they are mapped as a pair rather than independently.
_COLOUR_MAP = {
    "paper": "background",
    "surface": "card",
    "canvas": "muted",
    "mint": "muted",
    "ink": "foreground",
    "muted": "mutedForeground",
    "accent": "accent",
    "line": "border",
    "onAccent": "onAccent",
}


def _colours(palette: dict[str, Any], rng: random.Random) -> dict[str, str]:
    """The palette, as theme slots.

    One seeded variation, and it is deliberately small: a product type has exactly
    one curated palette, so two bakeries would otherwise be given identical colour.
    Half the time the accent becomes the palette's brand colour rather than its
    nominated call-to-action colour. Both are values the palette's author checked
    against their own foregrounds, so the contrast guarantee survives — which it
    would not if the colour were nudged or generated.
    """

    mapping = dict(_COLOUR_MAP)
    if rng.random() < 0.5 and palette.get("primary") and palette.get("onPrimary"):
        mapping["accent"] = "primary"
        mapping["onAccent"] = "onPrimary"

    return {
        slot: str(palette[source])
        for slot, source in mapping.items()
        if isinstance(palette.get(source), str) and palette[source].strip()
    }


def _tokens(style: dict[str, Any] | None) -> dict[str, str]:
    """Design tokens the style asks for, where the request can be honoured exactly.

    A style that says its corners are square should get square corners everywhere;
    applying that to one radius step and not the others would produce a page with
    mixed corners, which is worse than ignoring the instruction.
    """

    if not style:
        return {}

    variables = style.get("variables", "")
    tokens: dict[str, str] = {}

    if _SHARP_RADIUS.search(variables):
        for step in ("sm", "md", "lg"):
            tokens[f"radius-{step}"] = "0"

    if _NO_SHADOW.search(variables):
        for step in ("sm", "md", "lg"):
            tokens[f"shadow-{step}"] = "none"

    return tokens


def _fonts(pairing: dict[str, Any]) -> dict[str, str]:
    """The two faces, as CSS stacks.

    The fallbacks matter more than they look: a webfont request that fails, or is
    blocked, leaves a site in `ui-serif` — which is at least a serif, and reads as
    deliberate rather than broken.
    """

    display = str(pairing.get("heading", "")).strip()
    body = str(pairing.get("body", "")).strip()
    return {
        "display": f"'{display}', Georgia, serif" if display else "",
        "body": f"'{body}', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" if body else "",
        # The library ships a ready-made Google Fonts URL per pairing, weights
        # included. Rebuilding it here would mean guessing which weights the pairing
        # wants, and guessing wrong would silently change how the type looks.
        "href": str(pairing.get("url", "")).strip(),
    }


def choose_design(*, description: str, product_type: str | None = None) -> Design | None:
    """A complete design for a business, or `None` if nothing sensible matches.

    Returning `None` is deliberate. A site with no matching product type should keep
    the neutral default and say so, rather than be dressed in a design chosen from
    the wrong industry — which is how a plumber ends up with a wellness palette.
    """

    product = None
    if product_type:
        for candidate in _library().get("products", []):
            if candidate["productType"] == product_type:
                product = candidate
                break

    if product is None:
        product = match_product(description)

    if product is None:
        return None

    palette = _palette_for(product["productType"])
    if palette is None:
        return None

    styles = _styles_named(product.get("primaryStyle", "")) or _styles_named(
        product.get("secondaryStyles", "")
    )
    pairings = _candidate_pairings(product, description)
    if not pairings:
        return None

    rng = random.Random(_seed(description))

    style = rng.choice(styles) if styles else None
    # One of the best-fitting pairings rather than one of all 74: a pairing chosen
    # for an unrelated trade is the difference between a designed page and a
    # decorated one. Capped so the fit stays real while the seed still varies it.
    pairing = rng.choice(pairings[: min(6, len(pairings))])

    fonts = _fonts(pairing)

    return Design(
        product_type=product["productType"],
        style_id=style["id"] if style else "",
        style_name=style["name"] if style else "",
        pairing=pairing["name"],
        fonts={key: value for key, value in fonts.items() if value},
        colours=_colours(palette, rng),
        tokens=_tokens(style),
        rationale=str(product.get("considerations", "")).strip(),
    )


def resolve_design(payload: dict[str, Any]) -> Design | None:
    """A design named by someone else — the model, or the customer asking in chat.

    Every field is validated against the library, and anything that is not in it is
    refused rather than trusted. That matters because these values end up as CSS on a
    published page: an unchecked palette name would be a way to put arbitrary values
    on somebody's site, and an unchecked style id would be a way to reference a style
    whose contrast properties nobody has checked.
    """

    product_type = str(payload.get("product_type", "")).strip()
    if not product_type:
        return None

    library = _library()
    if not any(entry["productType"] == product_type for entry in library.get("palettes", [])):
        return None

    style_id = str(payload.get("style_id", "")).strip()
    style = None
    if style_id:
        style = next((entry for entry in library.get("styles", []) if entry["id"] == style_id), None)
        if style is None:
            return None

    pairing_name = str(payload.get("pairing", "")).strip()
    pairing = None
    if pairing_name:
        pairing = next(
            (entry for entry in library.get("typePairings", []) if entry["name"] == pairing_name),
            None,
        )
        if pairing is None:
            return None

    palette = _palette_for(product_type)
    product = next(
        (entry for entry in library.get("products", []) if entry["productType"] == product_type),
        None,
    )
    if palette is None or product is None:
        return None

    if pairing is None:
        candidates = _candidate_pairings(product, product_type)
        if not candidates:
            return None
        pairing = candidates[0]

    fonts = _fonts(pairing)

    return Design(
        product_type=product_type,
        style_id=style["id"] if style else "",
        style_name=style["name"] if style else "",
        pairing=pairing["name"],
        fonts={key: value for key, value in fonts.items() if value},
        # Resolved without a seed, so naming a design is a pure lookup: the same
        # product type always resolves to the same colours.
        colours=_colours(palette, random.Random(0)),
        tokens=_tokens(style),
        rationale=str(product.get("considerations", "")).strip(),
    )
