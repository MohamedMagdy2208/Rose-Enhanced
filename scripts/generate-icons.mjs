import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repositoryRoot, "docs", "branding", "summonerkit-icon-source.png");
const desktopAssets = path.join(repositoryRoot, "apps", "desktop", "assets");
const mobileAssets = path.join(repositoryRoot, "apps", "mobile", "public");
const windowsIconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

async function resizedPng(size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
}

function iconDirectory(pngs) {
  const directory = Buffer.alloc(6 + pngs.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(pngs.length, 4);
  let imageOffset = directory.length;
  pngs.forEach(({ size, png }, index) => {
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(png.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += png.length;
  });
  return directory;
}

async function windowsIcon() {
  const pngs = await Promise.all(windowsIconSizes.map(async (size) => ({ size, png: await resizedPng(size) })));
  return Buffer.concat([iconDirectory(pngs), ...pngs.map(({ png }) => png)]);
}

await Promise.all([mkdir(desktopAssets, { recursive: true }), mkdir(mobileAssets, { recursive: true })]);
const [desktopPng, trayPng, mobile192, mobile512, ico] = await Promise.all([
  resizedPng(512),
  resizedPng(32),
  resizedPng(192),
  resizedPng(512),
  windowsIcon(),
]);
await Promise.all([
  writeFile(path.join(desktopAssets, "icon.png"), desktopPng),
  writeFile(path.join(desktopAssets, "tray-icon.png"), trayPng),
  writeFile(path.join(desktopAssets, "icon.ico"), ico),
  writeFile(path.join(mobileAssets, "icon-192.png"), mobile192),
  writeFile(path.join(mobileAssets, "icon-512.png"), mobile512),
]);
