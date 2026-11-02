# Browser tests

End-to-end tests of the main flows in a real browser (Playwright + `node:test`),
against a running server with a database. CI runs them (`.github/workflows/ci.yml`,
job `e2e`); each test seeds its own event through the API with the admin token.

Locally, with the API and the built web app on port 3100:

```bash
npm install --prefix e2e --no-save --no-package-lock playwright@1.55.0
npx --prefix e2e playwright install chromium
E2E_BASE=http://localhost:3100 E2E_ADMIN_TOKEN=<token> node --test e2e/*.test.mjs
```
