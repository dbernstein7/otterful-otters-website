const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const originalsDir = path.join(process.cwd(), 'Otherside Otter Photos');
    const thumbsDir = path.join(process.cwd(), 'Otherside Otter Photos_thumbnails');
    const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

    let originals = [];
    try {
      originals = fs
        .readdirSync(originalsDir, { withFileTypes: true })
        .filter((d) => d.isFile() && imageExts.has(path.extname(d.name).toLowerCase()))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
    } catch {
      // originals dir missing (e.g. excluded by .vercelignore) — build from thumbnails
    }

    let thumbSet = new Set();
    let thumbNames = [];
    try {
      const thumbList = fs.readdirSync(thumbsDir, { withFileTypes: true }).filter((d) => d.isFile());
      thumbSet = new Set(thumbList.map((d) => d.name.toLowerCase()));
      thumbNames = thumbList.map((d) => d.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
    } catch {
      // no thumbnails
    }

    const files =
      originals.length > 0
        ? originals.map((name) => {
            const base = name.replace(/\.[^.]+$/, '');
            const thumbName = `${base}.jpg`;
            return { name, thumbName, hasThumbnail: thumbSet.has(thumbName.toLowerCase()) };
          })
        : thumbNames.map((thumbName) => {
            const base = thumbName.replace(/\.[^.]+$/, '');
            const name = `${base}.png`;
            return { name, thumbName, hasThumbnail: true };
          });

    return res.status(200).json({
      count: files.length,
      files,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to build manifest' });
  }
};

