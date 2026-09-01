const path = require("path");
const { buildGalleryManifest } = require("../lib/gallery-manifest/build.js");

const GALLERIES = {
  nifty: {
    originalsDir: "Nifty Photos",
    thumbsDir: "Nifty Photos_thumbnails",
  },
  otherside: {
    originalsDir: "Otherside Otter Photos",
    thumbsDir: "Otherside Otter Photos_thumbnails",
  },
};

function resolveGalleryKey(req) {
  const fromQuery = String(req.query?.gallery || "").trim().toLowerCase();
  if (fromQuery) return fromQuery;

  const url = String(req.url || "");
  const match = url.match(/\/api\/gallery-manifest\/([a-z0-9-]+)/i);
  if (match) return match[1].toLowerCase();

  return "";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const gallery = resolveGalleryKey(req);
  const config = GALLERIES[gallery];
  if (!config) {
    return res.status(404).json({ error: "Unknown gallery." });
  }

  try {
    const manifest = buildGalleryManifest(
      path.join(process.cwd(), config.originalsDir),
      path.join(process.cwd(), config.thumbsDir),
    );
    return res.status(200).json(manifest);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Failed to build manifest" });
  }
};
