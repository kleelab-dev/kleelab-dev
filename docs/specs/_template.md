# <Title of the change>

- **Status:** Draft | Approved | Built | Shipped
- **Date:** yyyy-mm-dd
- **Apps:** frontend / admin / backend
- **Size:** S (under a day) / M (a few days) / L (needs splitting)

## Why
The problem in one or two sentences, and who has it (visitor, client, staff).

## What changes
What the person will see or be able to do afterwards. Plain words, no code.

## Out of scope
What this change will deliberately not do.

## Design
### Backend
- Models and migration (columns, defaults, how existing rows are filled, downgrade)
- Endpoints (method, path, who may call it, request, response, errors)

### Frontend / admin
- Routes and components touched, with paths
- States: loading, empty, error, success
- Changes to `services/api.ts` and `types/`

### Words and SEO
- Copy to write, titles and descriptions, structured data

## Acceptance criteria
Each one is something a test or a reviewer can check.
1. Given …, when …, then …
2. …

## Risks
- Data, security, performance or rollout risks, and how each is handled.

## Build order
1. backend-engineer — …
2. frontend-engineer / admin-engineer / content-strategist — … (can run at the same time)
3. test-engineer — …

## Release notes
Environment variables to add on Render, migrations to run, anything to do by hand.
