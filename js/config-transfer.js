import { sanitizeFileName, buildDateStampedFileName } from "./file-names.js";

const MAGIC = "TTC1";
const FORMAT_NAME = "tulostaulu-konfiguraatio";
const FORMAT_VERSION = 1;

function buildManifest(state) {
  const entries = [];

  if (state.homeLogo) {
    entries.push({
      category: "homeLogo",
      name: state.homeLogo.file.name,
      type: state.homeLogo.file.type,
      size: state.homeLogo.file.size
    });
  }

  if (state.guestLogo) {
    entries.push({
      category: "guestLogo",
      name: state.guestLogo.file.name,
      type: state.guestLogo.file.type,
      size: state.guestLogo.file.size
    });
  }

  state.ads.forEach((entry) => {
    entries.push({
      category: "ad",
      name: entry.file.name,
      type: entry.file.type,
      size: entry.file.size
    });
  });

  if (state.goalVideo) {
    entries.push({
      category: "goal",
      name: state.goalVideo.file.name,
      type: state.goalVideo.file.type,
      size: state.goalVideo.file.size
    });
  }

  state.media.forEach((entry) => {
    entries.push({
      category: "media",
      name: entry.file.name,
      type: entry.file.type,
      size: entry.file.size
    });
  });

  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    homeName: state.homeName,
    guestName: state.guestName,
    replaceExisting: state.replaceExisting,
    entries
  };
}

function collectOrderedFiles(state) {
  const files = [];

  if (state.homeLogo) files.push(state.homeLogo.file);
  if (state.guestLogo) files.push(state.guestLogo.file);
  state.ads.forEach((entry) => files.push(entry.file));
  if (state.goalVideo) files.push(state.goalVideo.file);
  state.media.forEach((entry) => files.push(entry.file));

  return files;
}

export function exportConfigurationBlob(state) {
  const manifest = buildManifest(state);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

  const header = new Uint8Array(8);
  header.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(header.buffer).setUint32(4, manifestBytes.length, true);

  const files = collectOrderedFiles(state);

  return new Blob([header, manifestBytes, ...files], { type: "application/octet-stream" });
}

export function buildExportFileName(state) {
  return buildDateStampedFileName(state, "tulostaulu-konfiguraatio", "ttconf");
}

export async function parseConfigurationFile(file) {
  if (file.size < 8) {
    throw new Error("Tiedosto ei ole kelvollinen tulostaulu-konfiguraatiotiedosto.");
  }

  const headerBuffer = await file.slice(0, 8).arrayBuffer();
  const headerBytes = new Uint8Array(headerBuffer);
  const magic = new TextDecoder().decode(headerBytes.slice(0, 4));

  if (magic !== MAGIC) {
    throw new Error("Tiedosto ei ole kelvollinen tulostaulu-konfiguraatiotiedosto.");
  }

  const manifestLength = new DataView(headerBuffer).getUint32(4, true);
  const manifestStart = 8;
  const manifestEnd = manifestStart + manifestLength;

  if (file.size < manifestEnd) {
    throw new Error("Tiedosto on vioittunut tai keskeneräinen.");
  }

  const manifestText = await file.slice(manifestStart, manifestEnd).text();

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("Tiedoston sisältöä ei voitu lukea.");
  }

  if (!manifest || manifest.format !== FORMAT_NAME) {
    throw new Error("Tiedosto ei ole kelvollinen tulostaulu-konfiguraatiotiedosto.");
  }

  if (manifest.version !== FORMAT_VERSION) {
    throw new Error(`Tiedoston versiota (${manifest.version}) ei tueta.`);
  }

  let offset = manifestEnd;
  const filesByCategory = { homeLogo: null, guestLogo: null, ads: [], goal: null, media: [] };

  for (const entry of Array.isArray(manifest.entries) ? manifest.entries : []) {
    const start = offset;
    const end = start + entry.size;

    if (file.size < end) {
      throw new Error("Tiedosto on vioittunut tai keskeneräinen.");
    }

    const slice = file.slice(start, end, entry.type);
    const reconstructed = new File([slice], entry.name, { type: entry.type });
    offset = end;

    if (entry.category === "homeLogo") {
      filesByCategory.homeLogo = reconstructed;
    } else if (entry.category === "guestLogo") {
      filesByCategory.guestLogo = reconstructed;
    } else if (entry.category === "ad") {
      filesByCategory.ads.push(reconstructed);
    } else if (entry.category === "goal") {
      filesByCategory.goal = reconstructed;
    } else if (entry.category === "media") {
      filesByCategory.media.push(reconstructed);
    }
  }

  return {
    homeName: typeof manifest.homeName === "string" ? manifest.homeName : "",
    guestName: typeof manifest.guestName === "string" ? manifest.guestName : "",
    replaceExisting: typeof manifest.replaceExisting === "boolean" ? manifest.replaceExisting : true,
    files: filesByCategory
  };
}
