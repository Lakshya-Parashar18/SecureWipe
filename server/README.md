# SecureWipe Backend (Node + Express)

## Prerequisites
- Node.js 18+
- npm

## Install & Run
```
cd server
npm install
npm run dev    # starts http://localhost:8080 with file-watch
# or
npm start      # production
```

## Configuration
Create a `.env` in `server/` based on `ENV.sample` and fill values:

```
PORT=8080
# CORS origins (comma separated). Leave empty in dev to allow all.
CORS_ORIGIN=http://localhost:5173

# Public ISO URL (served by your CDN/bucket)
ISO_URL=https://cdn.example.com/securewipe.iso

# SMTP credentials for contact form
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_TO=owner@example.com
MAIL_FROM=no-reply@securewipe.example
```

## Endpoints
- GET `/healthz` – health check
- GET `/download` – 302 redirect to `ISO_URL` and logs request
- POST `/api/contact` – validates + relays message via SMTP
- GET `/api/releases/latest` – serves JSON from `releases.json`

## Notes
- Logs are printed to stdout; wire to your log sink in production.
- Replace `releases.json` contents when publishing new releases.
