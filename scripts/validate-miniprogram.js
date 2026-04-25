const fs = require("fs");
const path = require("path");

const requiredFiles = [
  "project.config.json",
  "miniprogram/app.js",
  "miniprogram/app.json",
  "miniprogram/app.wxss",
  "miniprogram/config.js",
  "miniprogram/sitemap.json",
  "miniprogram/services/oauth.js",
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

console.log("Mini Program structure is valid.");
