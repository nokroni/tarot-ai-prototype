const assert = require("assert");
const fs = require("fs");
const sharp = require("sharp");

let pageDefinition = null;
const originalSetTimeout = global.setTimeout;
const WHEEL_TEST_SCROLL_LEFT = 66;
const WHEEL_LAST_SCROLL_LEFT = 1694;
let vibrationCount = 0;

global.Page = (definition) => {
  pageDefinition = definition;
};

global.wx = {
  getSystemInfoSync() {
    return {
      windowWidth: 375
    };
  },
  vibrateShort() {
    vibrationCount += 1;
  }
};

global.setTimeout = (callback) => {
  callback();
  return 0;
};

require("../miniprogram/pages/index/index.js");

assert(pageDefinition, "Page definition should be registered.");

const context = {
  data: clone(pageDefinition.data),
  _interpreted: false,
  setData(update) {
    const nextData = clone(this.data);

    Object.keys(update).forEach((key) => {
      setDataPath(nextData, key, clone(update[key]));
    });

    this.data = nextData;
  },
  interpretReading() {
    this._interpreted = true;
  }
};

pageDefinition.drawCards.call(context);

assert.strictEqual(context.data.wheel.isOpen, true, "Wheel should open when drawing starts.");
assert.strictEqual(context.data.buildLabel, "0.6.17 稳定弧线轮盘", "Build label should identify the stable high arc wheel build.");
assert.strictEqual(context.data.wheel.requiredCount, 3, "Three-card spread should require three selections.");
assert.strictEqual(context.data.wheel.scrollLeft, 0, "Wheel should start at the first preassigned slot.");
assert.strictEqual(context.data.wheel.activeIndex, 0, "Wheel should start with the first slot highlighted.");
assert.strictEqual(context.data.wheelCards.length, 78, "Wheel should contain the complete 78-card deck.");
assert.strictEqual(context.data.wheel.cardBackSrc, "/images/card-back.png", "Wheel should use the shared card back.");
assert(
  context.data.wheelCards[0].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("translate(-103rpx, -583rpx)") &&
    context.data.wheelCards[7].arcStyle.includes("rotate(39.9deg)"),
  "Wheel cards should be presented as a higher stable arc around the active slot."
);

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_TEST_SCROLL_LEFT
  }
});
pageDefinition.onWheelNativeScrollEnd.call(context);

assert(vibrationCount > 0, "Wheel should vibrate when a card crosses the active selection highlight.");
assert.strictEqual(context.data.wheel.activeIndex, 3, "Native scroll position should map to the centered highlighted slot.");
assert.strictEqual(context.data.wheel.scrollLeft, WHEEL_TEST_SCROLL_LEFT, "Wheel should snap to the nearest native scroll slot.");
assert.strictEqual(context.data.wheel.selectedIndex, -1, "Scrolling should keep the wheel in choosing mode.");
assert(
  context.data.wheelCards[3].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[0].arcStyle.includes("translate(-19rpx, 371rpx)") &&
    context.data.wheelCards[6].arcStyle.includes("translate(-19rpx, -290rpx)"),
  "Wheel presentation should use the same active-slot arc after native scrolling."
);

const stableArcForActive = context.data.wheelCards.map((slot) => slot.arcStyle).join("|");

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_TEST_SCROLL_LEFT + 8
  }
});
pageDefinition.onWheelNativeScrollEnd.call(context);

assert.strictEqual(context.data.wheel.activeIndex, 3, "Approaching the same active slot should keep the same highlighted card.");
assert.strictEqual(
  context.data.wheelCards.map((slot) => slot.arcStyle).join("|"),
  stableArcForActive,
  "Same active slot should keep identical card heights regardless of fractional scroll approach."
);

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_LAST_SCROLL_LEFT
  }
});
pageDefinition.onWheelNativeScrollEnd.call(context);

assert.strictEqual(context.data.wheel.activeIndex, 77, "Wheel should allow snapping to the final deck slot.");
assert.strictEqual(context.data.wheel.scrollLeft, WHEEL_LAST_SCROLL_LEFT, "Final deck slot should be reachable by native scroll.");
assert(
  context.data.wheelCards[77].arcStyle.includes("translate(0rpx, 32rpx)") &&
    context.data.wheelCards[76].arcStyle.includes("translate(-2rpx, 146rpx)"),
  "Final deck slot should own the centered visual curve."
);

pageDefinition.onWheelNativeScroll.call(context, {
  detail: {
    scrollLeft: WHEEL_TEST_SCROLL_LEFT
  }
});
pageDefinition.onWheelNativeScrollEnd.call(context);

const uniqueCards = new Set(context.data.wheelCards.map((slot) => slot.cardId));
assert.strictEqual(uniqueCards.size, 78, "Wheel slots should map to unique card faces.");

const pageStyles = fs.readFileSync("miniprogram/pages/index/index.wxss", "utf8");
assert(
  pageStyles.includes("grid-template-columns: repeat(3, minmax(0, 1fr));"),
  "Three-card drawn spread should render horizontally."
);

for (let drawIndex = 0; drawIndex < 3; drawIndex += 1) {
  const activeIndex = context.data.wheel.activeIndex;
  const activeSlot = context.data.wheelCards[activeIndex];

  pageDefinition.onWheelCardTap.call(context, {
    currentTarget: {
      dataset: {
        index: activeIndex
      }
    }
  });
  assert.strictEqual(context.data.wheel.selectedIndex, activeIndex, "First tap should pop the active card.");
  assert.strictEqual(context.data.drawnCards.length, drawIndex, "First tap should not draw yet.");

  pageDefinition.onWheelCardTap.call(context, {
    currentTarget: {
      dataset: {
        index: activeIndex
      }
    }
  });
  assert.strictEqual(context.data.drawnCards.length, drawIndex + 1, "Second tap should confirm the card.");
  assert.strictEqual(
    context.data.drawnCards[drawIndex].card.id,
    activeSlot.cardId,
    "Confirmed card should preserve the preassigned wheel slot face."
  );
  assert.strictEqual(context.data.wheelCards[activeIndex].drawn, true, "Confirmed wheel slot should be marked drawn.");
}

assert.strictEqual(context.data.wheel.isOpen, false, "Wheel should close after the spread is complete.");
assert.strictEqual(context._interpreted, true, "Final draw should automatically start interpretation.");

global.setTimeout = originalSetTimeout;

assertCardBackHasTransparentCorners().then(() => {
  console.log("Wheel state test passed.");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setDataPath(target, path, value) {
  const segments = path.split(".");
  let node = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (!node[segment] || typeof node[segment] !== "object") {
      node[segment] = {};
    }

    node = node[segment];
  }

  node[segments[segments.length - 1]] = value;
}

async function assertCardBackHasTransparentCorners() {
  const { data, info } = await sharp("miniprogram/images/card-back.png")
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true
    });
  const cornerIndexes = [
    0,
    info.width - 1,
    (info.height - 1) * info.width,
    info.width * info.height - 1
  ];
  const alphas = cornerIndexes.map((pixelIndex) => data[pixelIndex * info.channels + 3]);

  assert(
    alphas.every((alpha) => alpha === 0),
    `Card back should have transparent corners, got alpha values ${alphas.join(", ")}.`
  );
}
