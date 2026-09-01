const fs = require("fs");
const path = require("path");

function buildGalleryManifest(originalsDir, thumbsDir) {
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

  let originals = [];
  try {
    originals = fs
      .readdirSync(originalsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && imageExts.has(path.extname(d.name).toLowerCase()))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
  } catch {
    // originals dir missing — build from thumbnails
  }

  let thumbSet = new Set();
  let thumbNames = [];
  try {
    const thumbList = fs.readdirSync(thumbsDir, { withFileTypes: true }).filter((d) => d.isFile());
    thumbSet = new Set(thumbList.map((d) => d.name.toLowerCase()));
    thumbNames = thumbList
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
  } catch {
    // no thumbnails
  }

  const originalBaseSet = new Set(originals.map((name) => name.replace(/\.[^.]+$/, "").toLowerCase()));
  const files = originals.map((name) => {
    const base = name.replace(/\.[^.]+$/, "");
    const thumbName = `${base}.jpg`;
    return { name, thumbName, hasThumbnail: thumbSet.has(thumbName.toLowerCase()) };
  });

  thumbNames.forEach((thumbName) => {
    const base = thumbName.replace(/\.[^.]+$/, "");
    if (originalBaseSet.has(base.toLowerCase())) return;
    files.push({ name: `${base}.png`, thumbName, hasThumbnail: true });
  });

  return { count: files.length, files };
}

module.exports = { buildGalleryManifest };
