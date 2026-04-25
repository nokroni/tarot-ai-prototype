const assert = require("assert");
const sharp = require("sharp");

let pageDefinition = null;
const originalSetTimeout = global.setTimeout;

global.Page = (definition) => {
  pageDefinition = definition;
};

global.wx = {
  vibrateShort() {}
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
    this.data = Object.assign({}, this.data, clone(update));
  },
  interpretReading() {
    this._interpreted = true;
  }
};

pageDefinition.drawCards.call(context);

assert.strictEqual(context.data.wheel.isOpen, true, "Wheel should open when drawing starts.");
assert.strictEqual(context.data.wheel.requiredCount, 3, "Three-card spread should require three selections.");
assert.strictEqual(context.data.wheelCards.length, 78, "Wheel should contain the complete 78-card deck.");
assert.strictEqual(context.data.wheel.cardBackSrc, "/images/card-back.png", "Wheel should use the shared card back.");

const uniqueCards = new Set(context.data.wheelCards.map((slot) => slot.cardId));
assert.strictEqual(uniqueCards.size, 78, "Wheel slots should map to unique card faces.");

for (let drawIndex = 0; drawIndex < 3; drawIndex += 1) {
  const activeIndex = context.data.wheel.activeIndex;
  const activeSlot = context.data.wheelCards[activeIndex];

  pageDefinition.onWheelFocusTap.call(context);
  assert.strictEqual(context.data.wheel.selectedIndex, activeIndex, "First tap should pop the active card.");
  assert.strictEqual(context.data.drawnCards.length, drawIndex, "First tap should not draw yet.");

  pageDefinition.onWheelFocusTap.call(context);
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
