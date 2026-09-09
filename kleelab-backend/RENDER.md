# Deploy the backend on Render

The repository includes a root `render.yaml` Blueprint. In Render, choose **New > Blueprint** and connect this repository. The Blueprint creates:

- `kleelab-api`, a Python web service
- `kleelab-db`, a managed PostgreSQL database

The web service runs database migrations and seeds the template catalog during its build. It exposes `/health` for Render health checks and binds to Render's `$PORT`.

## Required environment variable

Set `CORS_ORIGINS` on the web service to the deployed frontend origin, for example:

```text
https://your-frontend.onrender.com
```

For multiple origins, separate them with commas. Render generates `SECRET_KEY` and supplies `DATABASE_URL` from the managed database automatically.

## Optional integrations

Add the optional email, Sentry, or Slack values from `.env.example` in the Render Environment tab if those services are enabled later.