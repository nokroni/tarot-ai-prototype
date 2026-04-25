# AI Tarot Prototype

Prototype for the MVP described in `tarot.md`.

The active mobile prototype is now a WeChat Mini Program under `miniprogram/`.

The compiled Swift package contains the shared app logic:

- local tarot deck and spreads
- local card draw with upright/reversed orientation
- prompt construction that sends only already-drawn cards
- OpenAI Responses API client
- CLI smoke-test executable

The iOS SwiftUI app files live under `iOS/TarotAI/` and import the local `TarotCore` package.

## Toolchain

This workspace uses Swift 6.3.1 installed through Swift.org's `swiftly` tool:

```sh
/home/nokron/.local/share/swiftly/toolchains/6.3.1/usr/bin/swift --version
```

## Verify

```sh
/home/nokron/.local/share/swiftly/toolchains/6.3.1/usr/bin/swift test
/home/nokron/.local/share/swiftly/toolchains/6.3.1/usr/bin/swift build
```

## CLI Prototype

Without an API key, the CLI draws cards locally and prints the prompt that would be sent:

```sh
/home/nokron/.local/share/swiftly/toolchains/6.3.1/usr/bin/swift run tarot-prototype
```

With an API key:

```sh
OPENAI_API_KEY="sk-..." TAROT_QUESTION="What should I understand today?" /home/nokron/.local/share/swiftly/toolchains/6.3.1/usr/bin/swift run tarot-prototype
```

Set `TAROT_SPREAD=oneCard` for the one-card spread. The default is `threeCard`.

## iOS App

On macOS with Xcode, create a SwiftUI iOS app target, add this repository as a local Swift package, link `TarotCore`, then add the files under `iOS/TarotAI/` to the app target.

For local development, set `OPENAI_API_KEY` in the Xcode scheme environment. Direct client-side API keys are acceptable only for a prototype; production should use a backend proxy.

## UI Layout Screenshots Without a Mac

The GitHub Actions workflow generates `TarotAI.xcodeproj` on a macOS runner, launches the app in an iPhone simulator, and uploads light/dark screenshots as an artifact named `iphone-ui-screenshots`.

To run it manually:

```sh
gh workflow run "Swift Prototype" --repo nokroni/tarot-ai-prototype
gh run list --repo nokroni/tarot-ai-prototype --workflow "Swift Prototype"
```

Open the completed run in GitHub Actions and download the `iphone-ui-screenshots` artifact.

## WeChat Mini Program

The Mini Program uses AppID `wx19531898b7da5eec`, draws cards locally, and generates a local reflective reading. The WeChat AppSecret and upload private key must not be committed.

The page includes a prototype **ChatGPT OAuth** connection panel. In this repository it stores a demo OAuth-style session so the UX can be tested without exposing secrets. To use real model-generated readings, configure a backend in `miniprogram/config.js`:

- `oauth.tokenExchangeEndpoint`: exchanges WeChat login/OAuth handoff data for a user-scoped access token.
- `oauth.readingEndpoint`: accepts the local card draw plus `responseFormat`, then calls OpenAI server-side.

The reading endpoint should return the `tarot.reading.v1` JSON shape rendered by the page. Use OpenAI Responses API Structured Outputs with `text.format.type = "json_schema"` on the server so the page receives stable sections.

An example server contract is included at `docs/openai-reading-backend.example.mjs`. It expects the Mini Program to send `Authorization: Bearer <oauth access token>`, verifies that token in a placeholder function, then calls OpenAI with `OPENAI_API_KEY` from the server environment.

Install upload tooling:

```sh
npm install
```

Validate project structure:

```sh
npm run validate:mp
```

Create a preview QR code:

```sh
npm run preview:mp
```

Upload a development version:

```sh
WECHAT_UPLOAD_VERSION=0.1.0 WECHAT_UPLOAD_DESC="Tarot miniapp prototype" npm run upload:mp
```

The upload key is expected at:

```text
private.wx19531898b7da5eec.key
```

That file is ignored by git. Publishing to public users still requires the WeChat Mini Program admin review/release flow after upload.
