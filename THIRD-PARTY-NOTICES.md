# Third-party notices

KleeLab includes third-party material. This file records what, where it came from, and under
what terms — because "we found it on a machine" is not a licence.

---

## Design intelligence dataset

**Vendored at:** `kleelab-frontend/src/lib/design/data/`
**Derived from it at build time:** `kleelab-frontend/src/lib/design/generated/library.json`

The following files are copies of the `ui-ux-pro-max` dataset, taken unmodified:

| File | Records | Contents |
|---|---|---|
| `colors.csv` | 192 | Product-type colour palettes, each with its contrast-paired foreground |
| `typography.csv` | 74 | Heading and body font pairings with mood and target trades |
| `styles.csv` | 88 | Named interface styles with their design-system variables |
| `products.csv` | 192 | Product type to style, page pattern and palette guidance |
| `ui-reasoning.csv` | 192 | Decision rules and anti-patterns per interface category |
| `landing.csv` | 34 | Section-order patterns for landing pages |
| `ux-guidelines.csv` | 119 | Interface rules with severity |
| `motion.csv` | 17 | Motion presets with duration and easing |
| `google-font-licenses.json` | 1934 | Font family to licence, from the official `google/fonts` metadata |

**Source:** https://github.com/affaan-m/ECC — plugin `ecc`, version `2.2.0`, commit `ae303fb6c19e3f7cb88cb9fd9f15ddcf235294b6`

**Licence:** MIT

```
MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The dataset is copied rather than referenced because the generator runs on a server that has no
access to a developer's home directory, and because a build must not depend on what happens to be
installed on the machine that runs it. Copies are hash-recorded in the generated manifest, so we
can tell whether our snapshot still matches the upstream release.

### Fonts

Customer sites load display and body faces drawn from `typography.csv`. Those fonts are **not**
covered by the MIT licence above — each is licensed individually by its designer. The full family
list with licences is vendored as `google-font-licenses.json`, taken from the official
`google/fonts` repository metadata (`METADATA.pb`, revision `038b637d`).

Every family KleeLab ships is verified to be Open Font License, Apache-2.0 or Ubuntu Font License
before it is offered, and the build fails on an unlicensed family — see
`kleelab-frontend/scripts/compile-design-library.ts`. All three of those licences permit
embedding and redistribution in a commercial product. Families present in `excludedFamilies` in
the licence file are never used.

**Attribution for fonts is satisfied at runtime, not only here.** Fonts offered under the SIL Open
Font License must carry their copyright notice; the generated stylesheet writes the family's
notice to the page it is served on, so an end visitor can always see whose typeface they are
reading.

---

## Design guidance

Parts of KleeLab's generation prompts — the design-direction stage in particular — were written
with reference to the following, as guidance rather than as code. No text from either is copied
into the product, so no attribution is strictly required; they are recorded because they shaped
decisions that are hard to explain later without them.

- **`frontend-design`** — Apache License 2.0, terms in that skill's own `LICENSE.txt`. Source of
  the observation that generated design clusters into a few recognisable defaults, and of the
  plan-then-critique-then-build sequence.
- **`impeccable`**, **`emil-design-eng`**, **`design-system`**, **`frontend-design-direction`**,
  **`taste`**, **`accessibility`** — consulted as design method while building the token system and
  the section recipes.
