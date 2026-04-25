const fs = require("fs");
const path = require("path");
const ci = require("miniprogram-ci");
const packageJson = require("../package.json");

const appid = "wx19531898b7da5eec";
const command = process.argv[2] || "upload";
const projectPath = path.resolve(__dirname, "..", "miniprogram");
const privateKeyPath = path.resolve(__dirname, "..", `private.${appid}.key`);
const version = process.env.WECHAT_UPLOAD_VERSION || packageJson.version;
const desc = process.env.WECHAT_UPLOAD_DESC || "Tarot miniapp prototype";

if (!["preview", "upload"].includes(command)) {
  console.error("Usage: node scripts/wechat-upload.js <preview|upload>");
  process.exit(1);
}

assertPrivateKey(privateKeyPath);

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath,
  privateKeyPath,
  ignores: ["node_modules/**/*"]
});

const setting = {
  es6: true,
  minify: true,
  minifyJS: true,
  minifyWXML: true,
  minifyWXSS: true,
  autoPrefixWXSS: true
};

run().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});

async function run() {
  if (command === "preview") {
    const qrcodeOutputDest = path.resolve(__dirname, "..", "artifacts", "wechat-preview.jpg");

    fs.mkdirSync(path.dirname(qrcodeOutputDest), { recursive: true });

    const result = await ci.preview({
      project,
      version,
      desc,
      setting,
      qrcodeFormat: "image",
      qrcodeOutputDest,
      onProgressUpdate: console.log
    });

    console.log("Preview created:", qrcodeOutputDest);
    console.log(result);
    return;
  }

  const result = await ci.upload({
    project,
    version,
    desc,
    setting,
    onProgressUpdate: console.log
  });

  console.log("Upload complete.");
  console.log(result);
}

function assertPrivateKey(keyPath) {
  if (!fs.existsSync(keyPath)) {
    console.error(`Missing WeChat upload private key: ${keyPath}`);
    console.error("Download the code upload key from WeChat Mini Program admin and save it there.");
    process.exit(1);
  }

  const key = fs.readFileSync(keyPath, "utf8");

  if (!key.includes("BEGIN") || !key.includes("PRIVATE KEY")) {
    console.error(`${keyPath} is not a PEM private key.`);
    console.error("The Mini Program AppSecret is not the same as the code upload private key.");
    process.exit(1);
  }
}
