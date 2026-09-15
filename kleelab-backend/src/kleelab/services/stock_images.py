"""Filling empty image slots with real photographs.

A generated site with no photographs is a site full of empty frames, and that is
most of what makes an AI-built page look dead. The model can choose an image slot
and say what belongs in it, but it cannot produce pixels, so something has to.

**These are placeholders, not art direction.** The provider is a free
Unsplash-sourced service addressed by a deterministic seed, which means the photo
is real, stable across reloads, and *not necessarily about the business* — a
bakery may well be given a mountain. That is a deliberate trade: a plausible-
looking photographic page the owner replaces beats a grey box they ignore, and
the alternative (a keyword-aware provider) needs a paid key and a licensing
review we have not done. The recipe's `imageIntent` and the alt text carry the
meaning even when the picture does not.

Turn it off with `STOCK_IMAGES_ENABLED=false` and the slots fall back to the
designed placeholder.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from kleelab.core.config import settings

__all__ = ["fill_images", "IMAGE_KEYS"]

#: Keys a recipe may use for an image. Deliberately a closed list rather than
#: "anything ending in src": a field we do not recognise should stay empty for
#: the owner to fill, not silently receive a random photograph.
IMAGE_KEYS = ("imageSrc", "src")

#: Keys holding the text that describes the picture, used for the alt attribute
#: when the model did not write one.
INTENT_KEYS = ("imageIntent", "intent", "imageAlt", "alt")


def _photo_url(seed: str) -> str:
    """A stable photograph for a seed.

    The seed is quoted: it is built from a business name, which can contain
    spaces, ampersands and slashes. An unquoted slash would silently become part
    of the path and ask the provider for a differently-sized image.
    """

    base = settings.STOCK_IMAGE_BASE_URL.rstrip("/")
    return (
        f"{base}/seed/{quote(seed, safe='')}"
        f"/{settings.STOCK_IMAGE_WIDTH}/{settings.STOCK_IMAGE_HEIGHT}"
    )


def _walk(value: Any, *, path: str, describe: str, counter: list[int]) -> Any:
    """Give every empty image field in a content object a real photograph.

    Recursive because recipes nest: a gallery is a list of items each holding a
    `src`, and `features.alternating` puts an image inside each row. Handled in
    one place so a new recipe shape does not need a new special case.
    """

    if isinstance(value, dict):
        # The text that should describe this particular image, if the model wrote
        # one. Read before deciding, because the alt belongs with the picture.
        intent = ""
        for key in INTENT_KEYS:
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                intent = candidate.strip()
                break

        filled = {
            key: _walk(item, path=f"{path}.{key}", describe=intent or describe, counter=counter)
            for key, item in value.items()
        }

        for key in IMAGE_KEYS:
            if key not in filled:
                continue
            if isinstance(filled[key], str) and filled[key].strip():
                continue  # the owner or the model already supplied one
            counter[0] += 1
            # The section id, the field name and an occurrence counter together
            # keep two galleries on one page from receiving identical pictures.
            seed = f"{describe}-{path}-{key}-{counter[0]}".strip("-")
            filled[key] = _photo_url(seed)

        # An empty alt attribute on a real photograph is a screen-reader user
        # being told nothing. The model is asked for one; when it does not write
        # one, the image's own description is a better answer than silence.
        if any(isinstance(filled.get(key), str) and filled[key].strip() for key in IMAGE_KEYS):
            for key in ("alt", "imageAlt"):
                if key in filled and not (isinstance(filled[key], str) and filled[key].strip()):
                    filled[key] = intent or describe or "Photograph"

        return filled

    if isinstance(value, list):
        return [
            _walk(item, path=f"{path}.{index}", describe=describe, counter=counter)
            for index, item in enumerate(value)
        ]

    return value


def _seed_from_example(
    content: dict[str, Any],
    example: dict[str, Any],
    *,
    path: str,
    describe: str,
    counter: list[int],
) -> None:
    """Add the image fields the recipe promises but the model left out.

    The model is told to return `imageSrc` as an empty string, and usually does.
    When it omits the key entirely instead, the walk below never sees it and the
    slot renders as an empty frame — which is the failure that made generated
    pages look dead, and it is invisible in the response because a missing key
    and an empty one look the same once the schema has supplied its default.

    The recipe's own example is the list of keys that are supposed to exist, and
    the client sends it with every request. So the gap closes without the server
    knowing anything about the kit.

    Nested shapes are followed, because a gallery keeps its photo at
    `items[].src` and an alternating feature at `items[].imageSrc`.
    """

    for key, template in example.items():
        if key in IMAGE_KEYS and isinstance(template, str):
            existing = content.get(key)
            if isinstance(existing, str) and existing.strip():
                continue  # the model supplied one after all
            counter[0] += 1
            content[key] = _photo_url(f"{describe}-{path}.{key}-{counter[0]}".strip("-"))
            continue

        if isinstance(template, dict) and isinstance(content.get(key), dict):
            _seed_from_example(
                content[key], template, path=f"{path}.{key}", describe=describe, counter=counter
            )
            continue

        if isinstance(template, list) and template and isinstance(content.get(key), list):
            first = template[0]
            if not isinstance(first, dict):
                continue
            for index, item in enumerate(content[key]):
                if isinstance(item, dict):
                    _seed_from_example(
                        item,
                        first,
                        path=f"{path}.{key}.{index}",
                        describe=describe,
                        counter=counter,
                    )


def fill_images(
    content: dict[str, Any],
    *,
    describe: str,
    example: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return `content` with every image field pointing at a photograph.

    `describe` seeds the choice — the business name plus the section id — so the
    same site generates the same pictures every time it is rebuilt. `example` is
    the recipe's own shape, used to restore image keys the model omitted.
    """

    if not settings.STOCK_IMAGES_ENABLED:
        return content

    counter = [0]
    if isinstance(example, dict):
        _seed_from_example(content, example, path="", describe=describe, counter=counter)
    return _walk(content, path="", describe=describe, counter=counter)
