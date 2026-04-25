# AI Tarot Prototype

Swift prototype for the MVP described in `tarot.md`.

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
