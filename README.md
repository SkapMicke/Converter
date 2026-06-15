# Skap Converter

Node/Express-app för filkonvertering och batch-vattenstämpel.

## Funktioner
- PNG/JPG/WebP/AVIF/TIFF-konvertering via Sharp
- Video/ljud-konvertering via FFmpeg, t.ex. MP4 -> MP3
- PDF/EPS via ImageMagick + Ghostscript
- Batch-vattenstämpel med text eller logga
- ZIP-nedladdning för flera filer

## Installera
```bash
npm install
npm start
```
Öppna: http://localhost:3000

## Viktigt
För video/ljud krävs FFmpeg installerat på datorn/servern.
För PDF/EPS krävs ImageMagick + Ghostscript.

Windows:
- Installera FFmpeg och lägg i PATH
- Installera ImageMagick
- Installera Ghostscript

Linux/Ubuntu:
```bash
sudo apt update
sudo apt install ffmpeg imagemagick ghostscript
```

## Begränsning
Ingen app kan garantera exakt ALLA format utan rätt systemverktyg. Denna app försöker använda Sharp, FFmpeg och ImageMagick för bredast möjliga stöd.
