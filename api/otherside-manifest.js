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
    const originals = fs
      .readdirSync(originalsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && imageExts.has(path.extname(d.name).toLowerCase()))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));

    let thumbSet = null;
    try {
      thumbSet = new Set(
        fs
          .readdirSync(thumbsDir, { withFileTypes: true })
          .filter((d) => d.isFile())
          .map((d) => d.name.toLowerCase())
      );
    } catch {
      thumbSet = new Set();
    }

    const files = originals.map((name) => {
      const base = name.replace(/\.[^.]+$/, '');
      const thumbName = `${base}.jpg`;
      return {
        name,
        thumbName,
        hasThumbnail: thumbSet.has(thumbName.toLowerCase()),
      };
    });

    return res.status(200).json({
      count: files.length,
      files,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to build manifest' });
  }
};

