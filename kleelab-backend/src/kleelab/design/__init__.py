"""The design library: what KleeLab knows about how things should look.

Vendored reference data — 192 product-type palettes, 74 type pairings, 88 named
styles, landing-page patterns, UX rules and motion presets — compiled from CSVs by
`scripts/compile_design_library.py`. See `THIRD-PARTY-NOTICES.md` for its origin
and licence.

Why this lives on the server rather than being sent from the client, when the
section catalogue is sent from the client:

The rule in this project is that a frontend-owned contract travels *with the
request*, so there is never a second definition of it. The section catalogue obeys
that because the frontend executes it — the recipe's `build()` turns content into
nodes — so a copy anywhere else would be a second definition of behaviour.

This is not that. It is inert reference data: prose and colour values that only
ever end up inside a prompt. There is no executable half, so there is nothing to
disagree with. Sending it from the client instead would mean shipping half a
megabyte to every visitor and posting it back on every build, to save nothing.
"""
