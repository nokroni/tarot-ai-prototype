# AI Tarot WeChat Mini Program

Prototype for the MVP described in `tarot.md`, now targeting WeChat Mini Program only.

The active app lives under `miniprogram/`. Swift and iOS files from the first prototype may remain in the repository as legacy reference, but active development, CI, preview, and upload are WeChat-only.

## WeChat Mini Program

The Mini Program uses AppID `wx19531898b7da5eec`, draws tarot cards locally from the complete 78-card tarot deck, displays optimized card faces from `miniprogram/images/`, and renders Chinese readings through a stable `tarot.reading.v1` schema. The full source card art set is kept in `images/`; run `npm run build:card-images` to regenerate the compressed Mini Program bundle that fits under WeChat's 2 MB source-size limit.

The page uses WeChat CloudBase AI as the primary reading provider. `miniprogram/app.js` initializes CloudBase with environment `tarot-d9g2gcdx1cec4d83e`, and `miniprogram/config.js` points `wx.cloud.extend.AI` at `hunyuan-exp` / `hunyuan-2.0-instruct-20251111`. Model prompts require Simplified Chinese user-facing content while keeping JSON keys in English for the app renderer.

The former HTTPS backend path remains as an optional fallback for beta testing. The page still includes a fallback connection panel so the backend path can be exercised without storing model secrets in the Mini Program. To use the fallback, configure these values in `miniprogram/config.js`:

- `oauth.tokenExchangeEndpoint`: exchanges WeChat login/OAuth handoff data for a user-scoped access token.
- `oauth.readingEndpoint`: accepts the local card draw plus `responseFormat`, then calls OpenAI server-side.

The Mini Program must not contain OAuth client secrets, the WeChat AppSecret, or an OpenAI API key. CloudBase built-in Hunyuan calls use WeChat's official `wx.cloud.extend.AI` surface; non-CloudBase model calls should stay on a backend. An example backend contract is included at `docs/openai-reading-backend.example.mjs`.

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

Set `WECHAT_APPSECRET`, `OPENAI_API_KEY`, and `SESSION_SECRET` in `.env.local` for real WeChat auth and AI readings. The backend defaults to `OPENAI_MODEL=gpt-5.4-mini`, `OPENAI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_MODE=responses`, and `OPENAI_REASONING_EFFORT=low`.

`OPENAI_API_KEY` is the bearer token used by the model provider. For direct OpenAI Platform usage, set it to an OpenAI API key. For an internal OpenAI-compatible gateway, such as an OpenClaw Gateway kept on loopback, set `OPENAI_BASE_URL` to that gateway's `/v1` URL, set `OPENAI_API_KEY` to the gateway bearer token, and use `OPENAI_API_MODE=chat_completions` when the gateway does not support the Responses API `text.format` parameter. Without a bearer token, the backend still supports WeChat login but returns a configuration error for readings so the Mini Program can show a structured local fallback instead of pretending a model response was generated.

OpenClaw/Codex OAuth should be treated as a server-side gateway credential, not as a per-phone-user OAuth flow. Keep the OpenClaw Gateway private, for example on `127.0.0.1`, and let this backend be the only public HTTPS surface exposed to WeChat.

The fallback beta VPS route is:

```text
WeChat Mini Program -> https://muse-ai.cloud -> tarot-backend.service -> 127.0.0.1:18789 OpenClaw Gateway -> Codex OAuth GPT-5.4 mini
```

On the Ubuntu backend, `openclaw-gateway.service` is loopback-only. The backend uses `OPENAI_BASE_URL=http://127.0.0.1:18789/v1`, `OPENAI_API_MODE=chat_completions`, and `OPENAI_MODEL=openclaw/default`; OpenClaw maps that default agent to `openai-codex/gpt-5.4-mini`. Because the VPS cannot currently reach OpenAI directly, beta testing also depends on a local SSH reverse tunnel that exposes this machine's proxy to the VPS loopback:

```sh
ssh -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -R 127.0.0.1:7897:127.0.0.1:7897 tarot-backend
```

By default `miniprogram/config.js` keeps the Ubuntu-hosted HTTPS test backend as the fallback endpoint:

```text
https://muse-ai.cloud
```

For phone testing, `https://muse-ai.cloud` must be listed in the WeChat Mini Program admin request-domain settings.

Backend operations use the local SSH alias:

```sh
ssh tarot-backend
sudo systemctl status tarot-backend.service
sudo journalctl -u tarot-backend.service -f
```

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
