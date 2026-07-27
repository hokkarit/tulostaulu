const DEFAULT_TEAM_FULL_NAME = "Hämeenkyrön Hokkarit";
const DEFAULT_TEAM_SHORT_NAME = "Hokkarit";
const DEFAULT_TEAM_CATALOG = [
  {
    nimi: DEFAULT_TEAM_FULL_NAME,
    lyhytNimi: DEFAULT_TEAM_SHORT_NAME,
    paikkakunta: "Hämeenkyrö",
    logo: "Hokkarit.png"
  }
];
const LOGO_EXTENSIONS = ["png", "jpg", "jpeg"];
const LOGO_DIRECTORY = "./images/logos/";

let cachedCatalog = null;

function normalizeEntry(entry) {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed ? { nimi: trimmed, lyhytNimi: trimmed } : null;
  }

  if (entry && typeof entry === "object") {
    const nimiRaw = typeof entry.nimi === "string" ? entry.nimi : entry.name;
    const nimi = typeof nimiRaw === "string" ? nimiRaw.trim() : "";

    if (!nimi) {
      return null;
    }

    const lyhytNimiRaw = typeof entry.lyhytNimi === "string" ? entry.lyhytNimi : entry.shortName;
    const lyhytNimi = typeof lyhytNimiRaw === "string" ? lyhytNimiRaw.trim() : "";

    const paikkakuntaRaw = typeof entry.paikkakunta === "string" ? entry.paikkakunta : entry.city;
    const paikkakunta = typeof paikkakuntaRaw === "string" ? paikkakuntaRaw.trim() : "";

    const logoRaw = typeof entry.logo === "string" ? entry.logo : entry.file;
    const logo = typeof logoRaw === "string" ? logoRaw.trim() : "";

    return { nimi, lyhytNimi: lyhytNimi || nimi, paikkakunta, logo };
  }

  return null;
}

function normalizeCatalog(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data && data.teams)
      ? data.teams
      : null;

  if (!list) {
    return null;
  }

  const seen = new Set();
  const entries = [];

  list.forEach((rawEntry) => {
    const normalized = normalizeEntry(rawEntry);

    if (normalized && !seen.has(normalized.nimi)) {
      seen.add(normalized.nimi);
      entries.push(normalized);
    }
  });

  return entries.length > 0 ? entries : null;
}

export function getDefaultTeamName() {
  return DEFAULT_TEAM_FULL_NAME;
}

export async function loadTeamCatalog() {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  try {
    const response = await fetch("./teams.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("teams.json ei löytynyt.");
    }

    const data = await response.json();
    const entries = normalizeCatalog(data);

    cachedCatalog = entries || DEFAULT_TEAM_CATALOG.slice();
  } catch {
    cachedCatalog = DEFAULT_TEAM_CATALOG.slice();
  }

  return cachedCatalog;
}

function guessMimeType(filename) {
  const extension = filename.split(".").pop().toLowerCase();
  return extension === "png" ? "image/png" : "image/jpeg";
}

async function fetchLogoFileByFilename(filename) {
  const url = `${LOGO_DIRECTORY}${encodeURIComponent(filename)}`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (response.ok) {
      const blob = await response.blob();
      const mimeType = blob.type || guessMimeType(filename);
      return new File([blob], filename, { type: mimeType });
    }
  } catch {
    // Verkkovirhe tai tiedostoa ei löytynyt, kokeillaan seuraavaa vaihtoehtoa.
  }

  return null;
}

export async function fetchTeamLogoFile(entry) {
  const explicitLogo = entry && typeof entry.logo === "string" ? entry.logo.trim() : "";

  if (explicitLogo) {
    const file = await fetchLogoFileByFilename(explicitLogo);

    if (file) {
      return file;
    }
  }

  const fallbackName = entry && typeof entry.nimi === "string" ? entry.nimi : "";

  if (!fallbackName) {
    return null;
  }

  for (const extension of LOGO_EXTENSIONS) {
    const file = await fetchLogoFileByFilename(`${fallbackName}.${extension}`);

    if (file) {
      return file;
    }
  }

  return null;
}
