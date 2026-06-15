const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const util = require('util');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const execFileAsync = util.promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 1024 * 1024 * 800 }
});

app.use(express.static(path.join(ROOT, 'public')));
app.use('/outputs', express.static(OUTPUT_DIR));

const imageFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];
const videoAudioFormats = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'aac', 'm4a', 'ogg'];
const documentFormats = ['pdf', 'eps'];

function safeExt(ext) {
  return String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanName(name) {
  const parsed = path.parse(name || 'file');
  return parsed.name.replace(/[^a-zA-Z0-9-_åäöÅÄÖ]/g, '_').slice(0, 80) || 'file';
}

function outputPath(originalName, ext) {
  return path.join(OUTPUT_DIR, `${cleanName(originalName)}-${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`);
}

function publicUrl(filePath) {
  return `/outputs/${path.basename(filePath)}`;
}

function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function convertImage(input, output, ext) {
  let img = sharp(input, { animated: true });
  if (ext === 'jpg' || ext === 'jpeg') img = img.jpeg({ quality: 92 });
  else if (ext === 'png') img = img.png({ compressionLevel: 9 });
  else if (ext === 'webp') img = img.webp({ quality: 90 });
  else if (ext === 'avif') img = img.avif({ quality: 80 });
  else if (ext === 'tiff') img = img.tiff({ quality: 90 });
  else throw new Error('Bildformatet stöds inte av Sharp.');
  await img.toFile(output);
}

async function convertWithMagick(input, output) {
  try {
    await execFileAsync('magick', [input, output]);
  } catch (err) {
    throw new Error('ImageMagick saknas eller kunde inte konvertera detta format. Installera ImageMagick och Ghostscript för PDF/EPS.');
  }
}

async function convertFile(file, targetExt) {
  const ext = safeExt(targetExt);
  if (!ext) throw new Error('Välj ett målformat.');
  const out = outputPath(file.originalname, ext);
  const inputExt = safeExt(path.extname(file.originalname).replace('.', ''));

  if (imageFormats.includes(ext) && imageFormats.includes(inputExt) && ext !== 'gif') {
    await convertImage(file.path, out, ext);
    return out;
  }

  if (documentFormats.includes(ext) || inputExt === 'pdf' || inputExt === 'eps') {
    await convertWithMagick(file.path, out);
    return out;
  }

  if (videoAudioFormats.includes(ext)) {
    await runFfmpeg(file.path, out);
    return out;
  }

  // Fallback: try ImageMagick first for odd image/document conversions.
  await convertWithMagick(file.path, out);
  return out;
}

app.post('/api/convert', upload.array('files', 30), async (req, res) => {
  try {
    const target = safeExt(req.body.targetFormat);
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Inga filer uppladdade.' });

    const converted = [];
    for (const file of files) {
      const out = await convertFile(file, target);
      converted.push({ name: path.basename(out), url: publicUrl(out) });
    }

    if (converted.length === 1) return res.json({ files: converted, download: converted[0].url });

    const zipPath = path.join(OUTPUT_DIR, `converted-${Date.now()}-${uuidv4().slice(0, 8)}.zip`);
    await zipFiles(converted.map(f => path.join(OUTPUT_DIR, f.name)), zipPath);
    res.json({ files: converted, download: publicUrl(zipPath) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Konverteringen misslyckades.' });
  }
});

function buildTextSvg(text, opts = {}) {
  const fontSize = Number(opts.fontSize || 46);
  const opacity = Number(opts.opacity || 0.75);
  const color = opts.color || '#ffffff';
  const stroke = opts.stroke || '#000000';
  const safeText = String(text || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return Buffer.from(`
    <svg width="1200" height="220" xmlns="http://www.w3.org/2000/svg">
      <text x="30" y="120" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800"
        fill="${color}" stroke="${stroke}" stroke-width="3" opacity="${opacity}">${safeText}</text>
    </svg>
  `);
}

function gravity(position, margin) {
  const pos = position || 'bottom-right';
  const map = {
    'top-left': { left: margin, top: margin },
    'top-right': { right: margin, top: margin },
    'bottom-left': { left: margin, bottom: margin },
    'bottom-right': { right: margin, bottom: margin },
    'center': { gravity: 'center' }
  };
  return map[pos] || map['bottom-right'];
}

app.post('/api/watermark', upload.fields([{ name: 'images', maxCount: 80 }, { name: 'logo', maxCount: 1 }]), async (req, res) => {
  try {
    const images = (req.files && req.files.images) || [];
    const logo = req.files && req.files.logo && req.files.logo[0];
    const text = req.body.text || '';
    const position = req.body.position || 'bottom-right';
    const margin = Number(req.body.margin || 40);
    const opacity = Number(req.body.opacity || 0.75);
    const outputFormat = safeExt(req.body.outputFormat || 'jpg');

    if (!images.length) return res.status(400).json({ error: 'Ladda upp minst en bild.' });
    if (!text && !logo) return res.status(400).json({ error: 'Skriv text eller ladda upp en logga.' });

    const results = [];
    for (const image of images) {
      const out = outputPath(image.originalname, outputFormat);
      const baseMeta = await sharp(image.path).metadata();
      let overlay;

      if (logo) {
        const maxWidth = Math.max(120, Math.round((baseMeta.width || 1600) * 0.22));
        const logoBuffer = await sharp(logo.path)
          .resize({ width: maxWidth, withoutEnlargement: true })
          .ensureAlpha()
          .composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
          .png()
          .toBuffer();
        overlay = logoBuffer;
      } else {
        overlay = buildTextSvg(text, { opacity });
      }

      let img = sharp(image.path).rotate().composite([{ input: overlay, ...gravity(position, margin) }]);
      if (outputFormat === 'png') img = img.png();
      else if (outputFormat === 'webp') img = img.webp({ quality: 92 });
      else img = img.jpeg({ quality: 94 });
      await img.toFile(out);
      results.push(out);
    }

    const zipPath = path.join(OUTPUT_DIR, `watermarked-${Date.now()}-${uuidv4().slice(0, 8)}.zip`);
    await zipFiles(results, zipPath);
    res.json({ files: results.map(p => ({ name: path.basename(p), url: publicUrl(p) })), download: publicUrl(zipPath) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Vattenstämpeln misslyckades.' });
  }
});

function zipFiles(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const file of files) archive.file(file, { name: path.basename(file) });
    archive.finalize();
  });
}

app.listen(PORT, () => console.log(`Skap Converter körs på http://localhost:${PORT}`));
