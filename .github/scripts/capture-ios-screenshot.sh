#!/usr/bin/env bash
set -euo pipefail

DERIVED_DATA="${DERIVED_DATA:-$PWD/DerivedData}"
SCREENSHOT_DIR="${SCREENSHOT_DIR:-$PWD/artifacts/screenshots}"
BUNDLE_ID="${BUNDLE_ID:-com.nokron.tarotai}"

mkdir -p "$SCREENSHOT_DIR"

UDID="$(xcrun simctl list devices available --json | python3 -c '
import json
import sys

devices_by_runtime = json.load(sys.stdin)["devices"]
preferred = [
    "iPhone 16 Pro",
    "iPhone 16",
    "iPhone 15 Pro",
    "iPhone 15",
    "iPhone 14 Pro",
    "iPhone 14",
]

devices = [
    device
    for runtime_devices in devices_by_runtime.values()
    for device in runtime_devices
    if device.get("isAvailable") and device.get("name", "").startswith("iPhone")
]

if not devices:
    raise SystemExit("No available iPhone simulators found.")

for name in preferred:
    for device in devices:
        if device["name"] == name:
            print(device["udid"])
            raise SystemExit(0)

print(devices[0]["udid"])
')"

APP_PATH=""

cleanup() {
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b

xcodebuild \
  -project TarotAI.xcodeproj \
  -scheme TarotAI \
  -destination "id=$UDID" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products" -type d -name "TarotAI.app" -print -quit)"

if [[ -z "$APP_PATH" ]]; then
  echo "Unable to find built TarotAI.app under $DERIVED_DATA/Build/Products" >&2
  exit 1
fi

xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl launch "$UDID" "$BUNDLE_ID"
sleep 4

xcrun simctl ui "$UDID" appearance light
sleep 1
xcrun simctl io "$UDID" screenshot "$SCREENSHOT_DIR/home-light.png"

xcrun simctl ui "$UDID" appearance dark
sleep 1
xcrun simctl io "$UDID" screenshot "$SCREENSHOT_DIR/home-dark.png"

ls -lah "$SCREENSHOT_DIR"
