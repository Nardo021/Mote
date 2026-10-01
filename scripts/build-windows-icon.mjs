import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appIconDir = "macos/Mote/Resources/Assets.xcassets/AppIcon.appiconset";
const icoRelative = "windows/src/Mote.Windows/Resources/Mote.ico";
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const expectedPixels = [16, 32, 32, 64, 128, 256, 256, 512, 512, 1024];
const windowsSources = [
  { size: 16, file: "icon_16x16.png" },
  { size: 32, file: "icon_32x32.png" },
  { size: 64, file: "icon_32x32@2x.png" },
  { size: 128, file: "icon_128x128.png" },
  { size: 256, file: "icon_256x256.png" },
];

function fail(message) {
  const error = new Error(message);
  error.code = "ICON_CHECK";
  throw error;
}

function readBytes(rel) {
  return readFileSync(path.join(root, rel));
}

function pngInfo(bytes, label) {
  if (bytes.length < 29 || !bytes.subarray(0, 8).equals(pngSignature)) {
    fail(`${label} is not a PNG.`);
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    fail(`${label} is missing an IHDR chunk.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const compression = bytes[26];
  const filter = bytes[27];
  const interlace = bytes[28];
  if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
    fail(`${label} is ${width}x${height} depth ${bitDepth} color ${colorType}, expected 8-bit non-interlaced RGBA.`);
  }
  return { width, height };
}

function validateMacIcon() {
  const contents = JSON.parse(readBytes(`${appIconDir}/Contents.json`).toString("utf8"));
  const images = contents.images;
  if (!Array.isArray(images) || images.length !== expectedPixels.length) {
    fail(`AppIcon Contents.json must list ${expectedPixels.length} images.`);
  }

  const referenced = [];
  images.forEach((image, index) => {
    if (image.idiom !== "mac" || typeof image.filename !== "string" || typeof image.size !== "string" || typeof image.scale !== "string") {
      fail(`AppIcon image ${index} is not a mac idiom entry with filename, size, and scale.`);
    }
    const size = /^(\d+)x(\d+)$/.exec(image.size);
    const scale = /^(\d+)x$/.exec(image.scale);
    if (!size || !scale) {
      fail(`AppIcon image ${image.filename} has an unreadable size or scale.`);
    }
    const rel = `${appIconDir}/${image.filename}`;
    const info = pngInfo(readBytes(rel), rel);
    const factor = Number(scale[1]);
    const width = Number(size[1]) * factor;
    const height = Number(size[2]) * factor;
    if (info.width !== width || info.height !== height) {
      fail(`${rel} is ${info.width}x${info.height}, expected ${width}x${height} for ${image.size} @${image.scale}.`);
    }
    referenced.push(image.filename);
  });

  const pixels = images.map((image) => {
    const size = /^(\d+)x(\d+)$/.exec(image.size);
    const scale = /^(\d+)x$/.exec(image.scale);
    return Number(size[1]) * Number(scale[1]);
  });
  if (pixels.join(",") !== expectedPixels.join(",")) {
    fail(`AppIcon pixel ladder is ${pixels.join(", ")}.`);
  }

  const onDisk = readdirSync(path.join(root, appIconDir)).filter((name) => name.endsWith(".png")).sort();
  const expectedNames = [...referenced].sort();
  if (onDisk.join("\n") !== expectedNames.join("\n")) {
    fail(`AppIcon directory PNGs do not match Contents.json.\n${onDisk.join("\n")}`);
  }

  const pbx = readBytes("macos/Mote.xcodeproj/project.pbxproj").toString("utf8");
  const settings = [...pbx.matchAll(/ASSETCATALOG_COMPILER_APPICON_NAME = ([^;]+);/g)].map((match) => match[1].trim());
  if (settings.length < 2 || settings.some((value) => value !== "AppIcon")) {
    fail(`ASSETCATALOG_COMPILER_APPICON_NAME must be AppIcon on the Mac configurations. Found: ${settings.join(", ") || "none"}.`);
  }

  const readme = readBytes("docs/mote-icon.png");
  const icon256 = readBytes(`${appIconDir}/icon_256x256.png`);
  if (!readme.equals(icon256)) {
    fail("docs/mote-icon.png is not the same file as AppIcon icon_256x256.png.");
  }
}

function windowsImages() {
  return windowsSources.map((source) => {
    const rel = `${appIconDir}/${source.file}`;
    const png = readBytes(rel);
    const info = pngInfo(png, rel);
    if (info.width !== source.size || info.height !== source.size) {
      fail(`${rel} is ${info.width}x${info.height}, expected ${source.size}x${source.size}.`);
    }
    return { size: source.size, png };
  });
}

function buildIco(images) {
  const count = images.length;
  const header = 6 + 16 * count;
  let offset = header;
  const entries = images.map((image) => {
    const entry = { size: image.size, png: image.png, offset };
    offset += image.png.length;
    return entry;
  });
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  entries.forEach((entry, index) => {
    const at = 6 + index * 16;
    const dimension = entry.size >= 256 ? 0 : entry.size;
    out.writeUInt8(dimension, at);
    out.writeUInt8(dimension, at + 1);
    out.writeUInt8(0, at + 2);
    out.writeUInt8(0, at + 3);
    out.writeUInt16LE(1, at + 4);
    out.writeUInt16LE(32, at + 6);
    out.writeUInt32LE(entry.png.length, at + 8);
    out.writeUInt32LE(entry.offset, at + 12);
    entry.png.copy(out, entry.offset);
  });
  parseIco(out);
  return out;
}

function parseIco(bytes) {
  if (bytes.length < 6) {
    fail("ICO is too small.");
  }
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
    fail("ICO header is not a single icon type.");
  }
  const count = bytes.readUInt16LE(4);
  if (count !== windowsSources.length) {
    fail(`ICO contains ${count} images, expected ${windowsSources.length}.`);
  }
  let cursor = 6 + 16 * count;
  const images = [];
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 16;
    const widthByte = bytes[at];
    const heightByte = bytes[at + 1];
    const size = widthByte === 0 ? 256 : widthByte;
    if ((heightByte === 0 ? 256 : heightByte) !== size) {
      fail(`ICO entry ${index} is not square.`);
    }
    if (bytes[at + 2] !== 0 || bytes[at + 3] !== 0 || bytes.readUInt16LE(at + 4) !== 1 || bytes.readUInt16LE(at + 6) !== 32) {
      fail(`ICO entry ${index} does not use planes 1 and bit count 32.`);
    }
    const length = bytes.readUInt32LE(at + 8);
    const offset = bytes.readUInt32LE(at + 12);
    if (offset !== cursor || offset + length > bytes.length) {
      fail(`ICO entry ${index} is not packed at the expected offset.`);
    }
    const png = bytes.subarray(offset, offset + length);
    const info = pngInfo(png, `ICO ${size}x${size}`);
    if (info.width !== size || info.height !== size) {
      fail(`ICO entry ${index} claims ${size} but the PNG is ${info.width}x${info.height}.`);
    }
    images.push({ size, png: Buffer.from(png) });
    cursor += length;
  }
  if (cursor !== bytes.length) {
    fail("ICO has trailing bytes.");
  }
  const sizes = images.map((image) => image.size).join(",");
  if (sizes !== windowsSources.map((source) => source.size).join(",")) {
    fail(`ICO sizes are ${sizes}.`);
  }
  return images;
}

function readU16(bytes, offset) {
  if (offset + 2 > bytes.length) {
    fail("PE read went past the end of the file.");
  }
  return bytes.readUInt16LE(offset);
}

function readU32(bytes, offset) {
  if (offset + 4 > bytes.length) {
    fail("PE read went past the end of the file.");
  }
  return bytes.readUInt32LE(offset);
}

function sectionMap(bytes) {
  if (readU16(bytes, 0) !== 0x5a4d) {
    fail("Executable is not a PE file.");
  }
  const peOffset = readU32(bytes, 0x3c);
  if (bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    fail("Executable is missing a PE signature.");
  }
  const coff = peOffset + 4;
  const sectionCount = readU16(bytes, coff + 2);
  const optionalSize = readU16(bytes, coff + 16);
  const optional = coff + 20;
  const magic = readU16(bytes, optional);
  const pe32Plus = magic === 0x20b;
  if (magic !== 0x10b && !pe32Plus) {
    fail(`Unexpected PE magic 0x${magic.toString(16)}.`);
  }
  const numberOfRva = readU32(bytes, optional + (pe32Plus ? 108 : 92));
  if (numberOfRva <= 2) {
    fail("PE has no resource data directory.");
  }
  const directories = optional + (pe32Plus ? 112 : 96);
  const resourceRva = readU32(bytes, directories + 16);
  const resourceSize = readU32(bytes, directories + 20);
  if (resourceRva === 0 || resourceSize === 0) {
    fail("PE has an empty resource directory.");
  }
  const sectionTable = optional + optionalSize;
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const at = sectionTable + index * 40;
    sections.push({
      virtualSize: readU32(bytes, at + 8),
      virtualAddress: readU32(bytes, at + 12),
      rawSize: readU32(bytes, at + 16),
      rawPointer: readU32(bytes, at + 20),
    });
  }
  function rvaToOffset(rva) {
    for (const section of sections) {
      const span = section.virtualSize === 0 ? section.rawSize : section.virtualSize;
      if (rva < section.virtualAddress || rva >= section.virtualAddress + span) {
        continue;
      }
      const delta = rva - section.virtualAddress;
      if (delta >= section.rawSize) {
        fail(`RVA 0x${rva.toString(16)} is not stored in the file.`);
      }
      return section.rawPointer + delta;
    }
    fail(`RVA 0x${rva.toString(16)} is not in any section.`);
    return 0;
  }
  return { resourceOffset: rvaToOffset(resourceRva), rvaToOffset };
}

function resourcePayloads(bytes, typeId) {
  const { resourceOffset, rvaToOffset } = sectionMap(bytes);
  const payloads = [];
  function walk(directoryOffset, depth, selected) {
    if (depth > 3) {
      fail("PE resource tree is too deep.");
    }
    const named = readU16(bytes, directoryOffset + 12);
    const ids = readU16(bytes, directoryOffset + 14);
    const total = named + ids;
    for (let index = 0; index < total; index += 1) {
      const at = directoryOffset + 16 + index * 8;
      const nameOrId = readU32(bytes, at);
      const entryOffset = readU32(bytes, at + 4);
      const isName = index < named || (nameOrId & 0x80000000) !== 0;
      const id = isName ? null : nameOrId;
      const child = resourceOffset + (entryOffset & 0x7fffffff);
      const isDirectory = (entryOffset & 0x80000000) !== 0;
      const include = depth !== 0 || id === typeId;
      if (!include) {
        continue;
      }
      if (isDirectory) {
        walk(child, depth + 1, true);
        continue;
      }
      if (!selected && depth === 0) {
        continue;
      }
      const dataRva = readU32(bytes, child);
      const size = readU32(bytes, child + 4);
      const fileOffset = rvaToOffset(dataRva);
      if (size === 0 || fileOffset + size > bytes.length) {
        fail("PE icon resource is outside the file.");
      }
      payloads.push(Buffer.from(bytes.subarray(fileOffset, fileOffset + size)));
    }
  }
  walk(resourceOffset, 0, false);
  return payloads;
}

function groupIconSizes(payload) {
  if (payload.length < 6) {
    fail("PE group icon is too small.");
  }
  if (payload.readUInt16LE(2) !== 1) {
    fail("PE group icon type is not an icon.");
  }
  const count = payload.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 14;
    if (at + 14 > payload.length) {
      fail("PE group icon entry is truncated.");
    }
    const width = payload[at] === 0 ? 256 : payload[at];
    const height = payload[at + 1] === 0 ? 256 : payload[at + 1];
    if (width !== height) {
      fail(`PE group icon entry ${index} is not square.`);
    }
    sizes.push(width);
  }
  return sizes.sort((left, right) => left - right);
}

function verifyExecutable(exePath, images) {
  const absolute = path.resolve(exePath);
  if (!existsSync(absolute)) {
    fail(`Published executable was not found: ${absolute}`);
  }
  if (path.basename(absolute) !== "Mote.Windows.exe") {
    fail("Icon verification expects Mote.Windows.exe.");
  }
  const siblings = readdirSync(path.dirname(absolute));
  if (siblings.some((name) => name.toLowerCase().endsWith(".ico"))) {
    fail("Publish directory contains a loose .ico. The icon must be embedded in Mote.Windows.exe.");
  }
  const exe = readFileSync(absolute);
  const icons = resourcePayloads(exe, 3);
  const groups = resourcePayloads(exe, 14);
  if (groups.length === 0) {
    fail("Published executable has no group icon resource.");
  }
  const sizes = groupIconSizes(groups[0]);
  const expectedSizes = windowsSources.map((source) => source.size).slice().sort((left, right) => left - right);
  if (sizes.join(",") !== expectedSizes.join(",")) {
    fail(`Published group icon sizes are ${sizes.join(", ")}.`);
  }
  for (const image of images) {
    if (!icons.some((payload) => payload.equals(image.png))) {
      const found = icons.map((payload) => `${payload.length}:${payload.subarray(0, 8).toString("hex")}`).join(", ");
      fail(`Published executable is missing the ${image.size}x${image.size} Mote PNG payload. Icon resources: ${found || "none"}.`);
    }
  }
  console.log("PUBLISHED_EXECUTABLE_ICON_MATCHES_CANONICAL_PNG");
  console.log("VISUAL_ICON_ACCEPTANCE_NOT_RUN");
}

function parseArgs(argv) {
  let check = false;
  let verifyExe = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--verify-exe") {
      verifyExe = argv[index + 1] ?? "";
      index += 1;
      if (!verifyExe) {
        fail("--verify-exe requires a path.");
      }
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return { check, verifyExe };
}

try {
  const { check, verifyExe } = parseArgs(process.argv.slice(2));
  validateMacIcon();
  const images = windowsImages();
  const ico = buildIco(images);
  const icoPath = path.join(root, icoRelative);
  if (check || verifyExe) {
    if (!existsSync(icoPath) || !readFileSync(icoPath).equals(ico)) {
      fail("Mote.ico does not match the canonical AppIcon PNGs. Run: node scripts/build-windows-icon.mjs");
    }
    console.log("APP_ICON_CHECK_PASSED");
  } else {
    mkdirSync(path.dirname(icoPath), { recursive: true });
    writeFileSync(icoPath, ico);
    console.log(`Wrote ${icoRelative} (${ico.length} bytes)`);
  }
  if (verifyExe) {
    verifyExecutable(verifyExe, images);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
