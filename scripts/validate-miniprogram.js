const fs = require("fs");
const path = require("path");

const requiredFiles = [
  "project.config.json",
  "miniprogram/app.js",
  "miniprogram/app.json",
  "miniprogram/app.wxss",
  "miniprogram/config.js",
  "miniprogram/sitemap.json",
  "miniprogram/services/cloudbase-ai.js",
  "miniprogram/services/cloudrun.js",
  "miniprogram/services/language.js",
  "miniprogram/services/oauth.js",
  "miniprogram/services/reading-options.js",
  "miniprogram/services/reading-schema.js",
  "miniprogram/pages/index/index.js",
  "miniprogram/pages/index/index.json",
  "miniprogram/pages/index/index.wxml",
  "miniprogram/pages/index/index.wxss"
];

for (const file of requiredFiles) {
  const absolutePath = path.resolve(file);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

const projectConfig = JSON.parse(fs.readFileSync("project.config.json", "utf8"));

if (projectConfig.appid !== "wx19531898b7da5eec") {
  console.error("project.config.json appid does not match the requested appid.");
  process.exit(1);
}

const appConfig = JSON.parse(fs.readFileSync("miniprogram/app.json", "utf8"));

for (const page of appConfig.pages || []) {
  const pageBase = path.join("miniprogram", page);

  for (const extension of [".js", ".json", ".wxml", ".wxss"]) {
    if (!fs.existsSync(`${pageBase}${extension}`)) {
      console.error(`Page ${page} is missing ${extension}`);
      process.exit(1);
    }
  }
}

const cardImageFiles = fs
  .readdirSync("images")
  .filter((file) => /\.(jpe?g)$/i.test(file));

if (cardImageFiles.length < 78) {
  console.error("Remote card image source bundle must include the complete 78-card deck.");
  process.exit(1);
}

const cardBackPath = path.join("images", "card-back-source.png");

if (!fs.existsSync(cardBackPath)) {
  console.error("Remote card image source bundle must include card-back-source.png.");
  process.exit(1);
}

const localCardBackFallbackPath = path.join("miniprogram", "images", "card-back-fallback.png");

if (!fs.existsSync(localCardBackFallbackPath)) {
  console.error("Mini Program must include a local card-back fallback while remote media domains are pending.");
  process.exit(1);
}

for (const musicFile of ["bgm_intro.ogg", "bgm_intro_bar.ogg", "sfx_intro_rain.ogg"]) {
  const musicPath = path.join("music", musicFile);

  if (!fs.existsSync(musicPath)) {
    console.error(`Remote music source bundle must include ${musicFile}.`);
    process.exit(1);
  }
}

for (const musicFile of ["bgm_intro_fallback.m4a", "bgm_intro_bar_fallback.m4a", "sfx_intro_rain_fallback.m4a"]) {
  const musicPath = path.join("miniprogram", "music", musicFile);

  if (!fs.existsSync(musicPath)) {
    console.error(`Mini Program must include local fallback music file ${musicFile}.`);
    process.exit(1);
  }
}

const miniProgramConfig = require(path.resolve("miniprogram/config.js"));
const expectedCloudRunBaseUrl = "https://express-6a5b-251593-6-1425965613.sh.run.tcloudbase.com";

if (
  !miniProgramConfig.cloudRun ||
    miniProgramConfig.cloudRun.envId !== "prod-d0g9v713d07a202a0" ||
    miniProgramConfig.cloudRun.serviceName !== "express-6a5b" ||
    miniProgramConfig.cloudRun.baseUrl !== expectedCloudRunBaseUrl
) {
  console.error("Mini Program must be configured for the WeChat CloudBase Run service.");
  process.exit(1);
}

if (!miniProgramConfig.assets || miniProgramConfig.assets.baseUrl !== `${expectedCloudRunBaseUrl}/assets/tarot`) {
  console.error("Mini Program must point remote assets at the WeChat CloudBase Run service.");
  process.exit(1);
}

console.log("Mini Program structure is valid.");
