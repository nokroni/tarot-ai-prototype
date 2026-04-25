const fs = require("fs");
const path = require("path");

const sharp = require("sharp");

const sourceDir = path.resolve("images");
const outputDir = path.resolve("miniprogram/images");

async function main() {
  fs.mkdirSync(outputDir, {
    recursive: true
  });

  for (const file of fs.readdirSync(outputDir)) {
    fs.rmSync(path.join(outputDir, file), {
      force: true
    });
  }

  const sourceFiles = fs
    .readdirSync(sourceDir)
    .filter((file) => /\.(jpe?g)$/i.test(file))
    .sort();

  for (const file of sourceFiles) {
    await sharp(path.join(sourceDir, file))
      .resize({
        width: 260,
        withoutEnlargement: true
      })
      .jpeg({
        quality: 64,
        mozjpeg: true
      })
      .toFile(path.join(outputDir, file));
  }

  console.log(`Built ${sourceFiles.length} Mini Program card images.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
