# KleeLab admin

The team dashboard: client projects and enquiries. A separate Next.js app from
`kleelab-frontend` so it deploys on its own (for example admin.kleelab.com) and
none of it ships with the public site.

It talks to the same backend through `/api/*`, which `next.config.mjs` forwards
to `API_URL`. Only accounts with the `staff` role get in; make one with
`kleelab-backend/scripts/make_staff.py`.

Password resets for staff happen here too: set `ADMIN_URL` on the backend to
this app's address so staff reset emails link to it, not the public site.

```
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3001
```

## Deploying on Vercel

New project from this repository, Root Directory `kleelab-admin`, and set:

- `API_URL`: the backend, e.g. https://kleelab-dev.onrender.com

## Shared code

`src/services/api.ts`, `src/types/api.ts`, `src/components/project/*` and the UI
pieces are copies of the ones in `kleelab-frontend`. Change both when the API or
the project views change.
