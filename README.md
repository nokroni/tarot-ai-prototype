# AI Tarot WeChat Mini Program

This repository now contains only the WeChat Mini Program implementation and the tooling needed to validate, preview, upload, and build its media assets.

## App

- AppID: `wx19531898b7da5eec`
- Active app source: `miniprogram/`
- Source card art bundle: `images/`
- Source music bundle: `music/`
- Mini Program upload key path: `private.wx19531898b7da5eec.key`

The Mini Program draws cards locally from the complete 78-card deck, loads card art and music through the configured WeChat CloudBase asset path, and asks CloudBase AI for structured tarot readings. Secrets such as WeChat AppSecret and model provider keys must stay out of the Mini Program.

## Tooling

Install dependencies:

```sh
npm install
```

Validate the Mini Program structure:

```sh
npm run validate:mp
```

Run the wheel regression test:

```sh
npm run test:wheel
```

Create a preview QR code:

```sh
npm run preview:mp
```

Upload a development version:

```sh
npm run upload:mp
```

Optional upload metadata:

```sh
WECHAT_UPLOAD_VERSION=0.8.1 WECHAT_UPLOAD_DESC="Compact home tarot flow" npm run upload:mp
```

Publishing to public users still requires the WeChat Mini Program admin review/release flow after upload.
