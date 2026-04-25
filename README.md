# AI Tarot WeChat Mini Program

Prototype for the MVP described in `tarot.md`, now targeting WeChat Mini Program only.

The active app lives under `miniprogram/`. Swift and iOS files from the first prototype may remain in the repository as legacy reference, but active development, CI, preview, and upload are WeChat-only.

## WeChat Mini Program

The Mini Program uses AppID `wx19531898b7da5eec`, draws tarot cards locally, and renders readings through a stable `tarot.reading.v1` schema.

The page includes a prototype **ChatGPT OAuth** connection panel. In this repository it stores a demo OAuth-style session so the UX can be tested without exposing secrets. To use real model-generated readings, configure a backend in `miniprogram/config.js`:

- `oauth.tokenExchangeEndpoint`: exchanges WeChat login/OAuth handoff data for a user-scoped access token.
- `oauth.readingEndpoint`: accepts the local card draw plus `responseFormat`, then calls OpenAI server-side.

The Mini Program must not contain OAuth client secrets, the WeChat AppSecret, or an OpenAI API key. Keep model calls on a backend. An example backend contract is included at `docs/openai-reading-backend.example.mjs`.

## Tooling

Install dependencies:

```sh
npm install
```

Validate the Mini Program structure:

```sh
npm run validate:mp
```

Start the local test backend:

```sh
cp .env.example .env.local
npm run backend
```

Set `WECHAT_APPSECRET`, `OPENAI_API_KEY`, and `SESSION_SECRET` in `.env.local` for real WeChat auth and OpenAI readings. Without those values, the backend still runs in development mode so the Mini Program can exercise the backend auth and reading layout path.

By default `miniprogram/config.js` points at `http://127.0.0.1:8787`. That works in WeChat DevTools only when local/request-domain verification is disabled. For phone testing, expose this machine through an HTTPS tunnel, update `backendBaseUrl` in `miniprogram/config.js` to the tunnel URL, and add that HTTPS domain in the WeChat Mini Program admin request-domain settings.

Create a preview QR code:

```sh
npm run preview:mp
```

Upload a development version:

```sh
WECHAT_UPLOAD_VERSION=0.2.0 WECHAT_UPLOAD_DESC="ChatGPT OAuth structured reading prototype" npm run upload:mp
```

The upload key is expected at:

```text
private.wx19531898b7da5eec.key
```

That file is ignored by git. Publishing to public users still requires the WeChat Mini Program admin review/release flow after upload.

## Continuous Integration

GitHub Actions runs only the WeChat Mini Program validation workflow:

```sh
gh workflow run "WeChat Mini Program" --repo nokroni/tarot-ai-prototype
gh run list --repo nokroni/tarot-ai-prototype --workflow "WeChat Mini Program"
```
