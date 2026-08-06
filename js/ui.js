import { state, createFileEntry, revokeEntryPreview, resetState } from "./state.js";
import {
  validateTeamName,
  validateLogoFile,
  validateGoalVideoFile,
  validateAdFile,
  validateMediaFile,
  getVisibleLength,
  getFileExtension as extOf,
  formatFileSize,
  formatAspectRatio,
  isLargeFile
} from "./validation.js";
import { sanitizeFileName } from "./file-names.js";
import { readImageDimensions } from "./image-metadata.js";
import { isFileSystemAccessSupported, isChromeOrEdgeBrowser, pickRootDirectory } from "./file-system.js";
import {
  createWritePlan,
  writeConfiguration,
  createConfigurationZipBlob,
  buildZipExportFileName
} from "./configuration-writer.js";
import { loadTeamCatalog, fetchTeamLogoFile, getDefaultTeamName } from "./team-catalog.js";
import { loadPreferences, savePreferences, clearPreferences } from "./preferences.js";
import {
  saveCachedCategory,
  loadCachedCategory,
  clearAllCachedMedia,
  cachedItemToFile,
  requestPersistentStorage
} from "./media-cache.js";
import {
  exportConfigurationBlob,
  buildExportFileName,
  parseConfigurationFile
} from "./config-transfer.js";

const $ = (id) => document.getElementById(id);

const refs = {};

const touched = {
  home: false,
  guest: false,
  home2: false,
  guest2: false
};

const STATE_FIELD_BY_KIND = {
  home: "homeName",
  guest: "guestName",
  home2: "homeName2",
  guest2: "guestName2"
};

const HAS_LOGO_BY_KIND = {
  home: true,
  guest: true,
  home2: false,
  guest2: false
};

const LARGE_FILE_WARNING_TEXT = "Tiedosto on erittäin suuri. Kirjoittaminen voi kestää pitkään.";

let teamCatalog = [];
const lastAutoLogoKey = { home: null, guest: null };
let dragState = null;
const preferences = loadPreferences();
let rememberedAdOrder = preferences.adNameOrder.slice();
const restoredEntryIds = { ads: new Set(), goal: null, media: new Set() };
let importInfo = null;
let isExportingZip = false;
let lastExportMethod = "usb";

function persistAdsCache() {
  saveCachedCategory("ads", state.ads.map((entry) => entry.file));
}

function persistMediaCache() {
  saveCachedCategory("media", state.media.map((entry) => entry.file));
}

function persistGoalCache() {
  saveCachedCategory("goal", state.goalVideo ? [state.goalVideo.file] : []);
}

function persistAdOrder() {
  rememberedAdOrder = state.ads.map((entry) => sanitizeFileName(entry.file.name));
  savePreferences({ adNameOrder: rememberedAdOrder });
}

function sortFilesByRememberedOrder(files, order) {
  const orderIndex = new Map(order.map((name, index) => [name, index]));

  return files
    .map((file, originalIndex) => ({ file, originalIndex }))
    .sort((a, b) => {
      const aPos = orderIndex.has(sanitizeFileName(a.file.name))
        ? orderIndex.get(sanitizeFileName(a.file.name))
        : Infinity;
      const bPos = orderIndex.has(sanitizeFileName(b.file.name))
        ? orderIndex.get(sanitizeFileName(b.file.name))
        : Infinity;

      if (aPos !== bPos) {
        return aPos - bPos;
      }

      return a.originalIndex - b.originalIndex;
    })
    .map((item) => item.file);
}

function cacheRefs() {
  const ids = [
    "fsa-warning",
    "page-menu-button",
    "page-menu-list",
    "export-configuration-button",
    "import-configuration-button",
    "import-configuration-input",
    "export-zip-button",
    "media-cache-notice",
    "media-cache-notice-text",
    "media-cache-clear-button",
    "configuration-form",
    "pienpeli-checkbox",
    "pienpeli-teams-section",
    "home-name-input",
    "home-name-suggestions",
    "home-name-counter",
    "home-name-error",
    "home-name-status",
    "home-logo-field",
    "home-logo-input",
    "home-logo-dropzone",
    "home-logo-preview-wrap",
    "home-logo-preview",
    "home-logo-filename",
    "home-logo-dimensions",
    "home-logo-warning",
    "home-logo-remove-button",
    "home-logo-error",
    "guest-name-input",
    "guest-name-suggestions",
    "guest-name-counter",
    "guest-name-error",
    "guest-name-status",
    "guest-logo-field",
    "guest-logo-input",
    "guest-logo-dropzone",
    "guest-logo-preview-wrap",
    "guest-logo-preview",
    "guest-logo-filename",
    "guest-logo-dimensions",
    "guest-logo-warning",
    "guest-logo-remove-button",
    "guest-logo-error",
    "home2-name-input",
    "home2-name-suggestions",
    "home2-name-counter",
    "home2-name-error",
    "home2-name-status",
    "guest2-name-input",
    "guest2-name-suggestions",
    "guest2-name-counter",
    "guest2-name-error",
    "guest2-name-status",
    "ad-input",
    "ad-dropzone",
    "ad-error",
    "ads-list",
    "goal-input",
    "goal-dropzone",
    "goal-error",
    "goal-list",
    "media-input",
    "media-dropzone",
    "media-error",
    "media-list",
    "replace-existing-checkbox",
    "replace-warning",
    "write-button",
    "write-button-hint",
    "progress-region",
    "progress-text",
    "progress-count",
    "success-view",
    "success-heading",
    "success-summary",
    "success-instructions",
    "success-tech-details-button",
    "success-tech-details-wrap",
    "success-tech-details-textarea",
    "success-tech-details-copy-button",
    "new-configuration-button",
    "rewrite-configuration-button",
    "error-view",
    "error-message",
    "error-tech-details-button",
    "error-tech-details-wrap",
    "error-tech-details-textarea",
    "error-tech-details-copy-button",
    "error-close-button",
    "directory-confirm-dialog",
    "directory-confirm-cancel-button",
    "directory-confirm-proceed-button",
    "zip-confirm-dialog",
    "zip-confirm-cancel-button",
    "zip-confirm-proceed-button"
  ];

  ids.forEach((id) => {
    refs[id] = $(id);
  });
}

function setHidden(el, hidden) {
  el.hidden = hidden;
}

function setFieldError(el, message) {
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function setFieldWarning(el, message) {
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

const STATUS_ICON_PATHS = {
  success: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  info: "m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
};

function setStatusMessage(el, iconType, text) {
  el.textContent = "";

  if (!text) {
    return;
  }

  if (iconType && STATUS_ICON_PATHS[iconType]) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("status-icon");

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", STATUS_ICON_PATHS[iconType]);
    svg.appendChild(path);

    el.appendChild(svg);
  }

  const textSpan = document.createElement("span");
  textSpan.textContent = text;
  el.appendChild(textSpan);
}

// --- Joukkueen nimet ja joukkuetietokanta -------------------------------

const MAX_VISIBLE_SUGGESTIONS = 3;

const suggestionState = {
  home: { matches: [], activeIndex: -1, suppressNext: false },
  guest: { matches: [], activeIndex: -1, suppressNext: false },
  home2: { matches: [], activeIndex: -1, suppressNext: false },
  guest2: { matches: [], activeIndex: -1, suppressNext: false }
};

function getNameInput(kind) {
  return refs[`${kind}-name-input`];
}

function getSuggestionListEl(kind) {
  return refs[`${kind}-name-suggestions`];
}

function findTeamCatalogEntry(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return (
    teamCatalog.find((entry) => entry.nimi === trimmed) ||
    teamCatalog.find((entry) => entry.lyhytNimi === trimmed) ||
    null
  );
}

function getSuggestionMatches(query) {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const lowerQuery = trimmed.toLowerCase();
  const results = [];

  for (const entry of teamCatalog) {
    const nimiIndex = entry.nimi.toLowerCase().indexOf(lowerQuery);

    if (nimiIndex !== -1) {
      results.push({ entry, field: "nimi", matchStart: nimiIndex, matchLength: trimmed.length });
      continue;
    }

    const lyhytIndex = entry.lyhytNimi.toLowerCase().indexOf(lowerQuery);

    if (lyhytIndex !== -1) {
      results.push({ entry, field: "lyhytNimi", matchStart: lyhytIndex, matchLength: trimmed.length });
      continue;
    }

    if (entry.paikkakunta) {
      const paikkakuntaIndex = entry.paikkakunta.toLowerCase().indexOf(lowerQuery);

      if (paikkakuntaIndex !== -1) {
        results.push({
          entry,
          field: "paikkakunta",
          matchStart: paikkakuntaIndex,
          matchLength: trimmed.length
        });
      }
    }
  }

  return results.slice(0, MAX_VISIBLE_SUGGESTIONS);
}

function buildHighlightedFragment(text, matchStart, matchLength) {
  const fragment = document.createDocumentFragment();

  const before = text.slice(0, matchStart);
  const match = text.slice(matchStart, matchStart + matchLength);
  const after = text.slice(matchStart + matchLength);

  if (before) {
    fragment.appendChild(document.createTextNode(before));
  }

  if (match) {
    const mark = document.createElement("mark");
    mark.textContent = match;
    fragment.appendChild(mark);
  }

  if (after) {
    fragment.appendChild(document.createTextNode(after));
  }

  return fragment;
}

function updateActiveSuggestionOption(kind) {
  const info = suggestionState[kind];
  const input = getNameInput(kind);
  const listEl = getSuggestionListEl(kind);
  const options = listEl.querySelectorAll(".suggestion-option");

  options.forEach((option, index) => {
    const isActive = index === info.activeIndex;
    option.classList.toggle("suggestion-option-active", isActive);
    option.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (info.activeIndex >= 0 && options[info.activeIndex]) {
    input.setAttribute("aria-activedescendant", options[info.activeIndex].id);
    options[info.activeIndex].scrollIntoView({ block: "nearest" });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

function openSuggestions(kind) {
  getSuggestionListEl(kind).hidden = false;
  getNameInput(kind).setAttribute("aria-expanded", "true");
}

function closeSuggestions(kind) {
  const input = getNameInput(kind);
  const listEl = getSuggestionListEl(kind);

  listEl.hidden = true;
  listEl.innerHTML = "";
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");

  suggestionState[kind].matches = [];
  suggestionState[kind].activeIndex = -1;
}

function selectSuggestion(kind, entry) {
  const input = getNameInput(kind);

  input.value = entry.lyhytNimi;
  touched[kind] = true;
  suggestionState[kind].suppressNext = true;
  closeSuggestions(kind);
  handleNameInput(kind);
  input.focus();
}

function updateSuggestions(kind) {
  const info = suggestionState[kind];

  if (info.suppressNext) {
    info.suppressNext = false;
    return;
  }

  const input = getNameInput(kind);
  const listEl = getSuggestionListEl(kind);
  const matches = getSuggestionMatches(input.value);

  info.matches = matches;
  info.activeIndex = -1;
  listEl.innerHTML = "";

  if (matches.length === 0) {
    closeSuggestions(kind);
    return;
  }

  matches.forEach((match, index) => {
    const li = document.createElement("li");
    li.id = `${input.id}-option-${index}`;
    li.className = "suggestion-option";
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");

    const primary = document.createElement("div");

    if (match.field === "nimi") {
      primary.appendChild(buildHighlightedFragment(match.entry.nimi, match.matchStart, match.matchLength));
    } else {
      primary.appendChild(document.createTextNode(match.entry.nimi));
    }

    li.appendChild(primary);

    if (match.entry.lyhytNimi !== match.entry.nimi) {
      const secondary = document.createElement("div");
      secondary.className = "suggestion-option-secondary";
      secondary.appendChild(document.createTextNode("Lyhyt nimi: "));

      if (match.field === "lyhytNimi") {
        secondary.appendChild(
          buildHighlightedFragment(match.entry.lyhytNimi, match.matchStart, match.matchLength)
        );
      } else {
        secondary.appendChild(document.createTextNode(match.entry.lyhytNimi));
      }

      li.appendChild(secondary);
    }

    if (match.field === "paikkakunta" && match.entry.paikkakunta) {
      const cityLine = document.createElement("div");
      cityLine.className = "suggestion-option-secondary";
      cityLine.appendChild(document.createTextNode("Paikkakunta: "));
      cityLine.appendChild(
        buildHighlightedFragment(match.entry.paikkakunta, match.matchStart, match.matchLength)
      );
      li.appendChild(cityLine);
    }

    li.addEventListener("mousedown", (event) => {
      // Estää inputin fokuksen katoamisen ennen klikkauksen käsittelyä.
      event.preventDefault();
    });
    li.addEventListener("click", () => {
      selectSuggestion(kind, match.entry);
    });

    listEl.appendChild(li);
  });

  openSuggestions(kind);
}

function handleNameInputKeydown(kind, event) {
  const info = suggestionState[kind];
  const listEl = getSuggestionListEl(kind);

  if (listEl.hidden || info.matches.length === 0) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    info.activeIndex = (info.activeIndex + 1) % info.matches.length;
    updateActiveSuggestionOption(kind);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    info.activeIndex = (info.activeIndex - 1 + info.matches.length) % info.matches.length;
    updateActiveSuggestionOption(kind);
  } else if (event.key === "Enter") {
    if (info.activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(kind, info.matches[info.activeIndex].entry);
    }
  } else if (event.key === "Escape") {
    closeSuggestions(kind);
  }
}

async function triggerTeamLogoAutoFill(kind, entry, statusEl) {
  const cacheKey = entry.nimi;

  if (lastAutoLogoKey[kind] === cacheKey) {
    return;
  }

  lastAutoLogoKey[kind] = cacheKey;
  statusEl.textContent = `Haetaan joukkueen "${entry.nimi}" logoa tietokannasta…`;

  const logoFile = await fetchTeamLogoFile(entry);

  if (lastAutoLogoKey[kind] !== cacheKey) {
    return;
  }

  if (!logoFile) {
    setStatusMessage(statusEl, "info", "Logoa ei löytynyt tietokannasta. Voit valita sen käsin alla.");
    return;
  }

  await handleLogoFiles(kind, [logoFile]);
  setStatusMessage(statusEl, "success", "Logo haettu tietokannasta.");
}

function handleNameInput(kind) {
  const input = getNameInput(kind);
  const counter = refs[`${kind}-name-counter`];
  const errorEl = refs[`${kind}-name-error`];
  const statusEl = refs[`${kind}-name-status`];

  const rawValue = input.value;
  const trimmedValue = rawValue.trim();
  const matchedEntry = findTeamCatalogEntry(rawValue);

  if (matchedEntry && matchedEntry.nimi === trimmedValue && matchedEntry.lyhytNimi !== trimmedValue) {
    // Käyttäjä kirjoitti joukkueen koko nimen: muunnetaan se automaattisesti
    // tietokannan mukaiseksi lyhyeksi nimeksi (enintään 8 merkkiä) ja suljetaan ehdotukset.
    input.value = matchedEntry.lyhytNimi;
    suggestionState[kind].suppressNext = true;
    closeSuggestions(kind);
    handleNameInput(kind);
    return;
  }

  state[STATE_FIELD_BY_KIND[kind]] = rawValue;
  savePreferences({ [STATE_FIELD_BY_KIND[kind]]: trimmedValue });

  touched[kind] = true;

  counter.textContent = `${getVisibleLength(rawValue)} / 8`;

  const errorMessage = validateTeamName(rawValue);
  setFieldError(errorEl, touched[kind] ? errorMessage : "");

  if (HAS_LOGO_BY_KIND[kind] && !state.pienpeli) {
    if (matchedEntry) {
      triggerTeamLogoAutoFill(kind, matchedEntry, statusEl);
    } else {
      lastAutoLogoKey[kind] = null;
      statusEl.textContent = "";
    }
  }

  refreshDerivedViews();
}

function handleNameBlur(kind) {
  touched[kind] = true;
  handleNameInput(kind);
  closeSuggestions(kind);
}

// --- Logot ---------------------------------------------------------------

async function handleLogoFiles(kind, fileList) {
  const file = fileList && fileList[0];
  const errorEl = kind === "home" ? refs["home-logo-error"] : refs["guest-logo-error"];

  if (!file) {
    return;
  }

  const validationMessage = validateLogoFile(file);

  if (validationMessage) {
    setFieldError(errorEl, validationMessage);
    return;
  }

  let dimensions;
  try {
    dimensions = await readImageDimensions(file);
  } catch {
    setFieldError(errorEl, "Kuvan tietoja ei voitu lukea. Kuvaa ei hyväksytty.");
    return;
  }

  setFieldError(errorEl, "");

  const previousEntry = kind === "home" ? state.homeLogo : state.guestLogo;
  if (previousEntry) {
    revokeEntryPreview(previousEntry);
  }

  const entry = createFileEntry(file, {
    previewUrl: URL.createObjectURL(file),
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: dimensions.aspectRatio
  });

  if (kind === "home") {
    state.homeLogo = entry;
  } else {
    state.guestLogo = entry;
  }

  renderLogo(kind);
  refreshDerivedViews();
}

function renderLogo(kind) {
  const entry = kind === "home" ? state.homeLogo : state.guestLogo;
  const wrap = kind === "home" ? refs["home-logo-preview-wrap"] : refs["guest-logo-preview-wrap"];
  const img = kind === "home" ? refs["home-logo-preview"] : refs["guest-logo-preview"];
  const nameEl = kind === "home" ? refs["home-logo-filename"] : refs["guest-logo-filename"];
  const dimsEl = kind === "home" ? refs["home-logo-dimensions"] : refs["guest-logo-dimensions"];
  const warningEl = kind === "home" ? refs["home-logo-warning"] : refs["guest-logo-warning"];

  if (!entry) {
    setHidden(wrap, true);
    setHidden(img, true);
    img.removeAttribute("src");
    return;
  }

  img.src = entry.previewUrl;
  img.alt = `${kind === "home" ? "Kotijoukkueen" : "Vierasjoukkueen"} logon esikatselu`;
  nameEl.textContent = entry.file.name;
  dimsEl.textContent =
    `${entry.width} x ${entry.height} px, kuvasuhde ${formatAspectRatio(entry.aspectRatio)}`;

  setFieldWarning(warningEl, isLargeFile(entry.file) ? LARGE_FILE_WARNING_TEXT : "");

  setHidden(img, false);
  setHidden(wrap, false);
}

function removeLogo(kind) {
  const entry = kind === "home" ? state.homeLogo : state.guestLogo;

  if (entry) {
    revokeEntryPreview(entry);
  }

  if (kind === "home") {
    state.homeLogo = null;
    refs["home-logo-input"].value = "";
  } else {
    state.guestLogo = null;
    refs["guest-logo-input"].value = "";
  }

  lastAutoLogoKey[kind] = null;
  const statusEl = kind === "home" ? refs["home-name-status"] : refs["guest-name-status"];
  statusEl.textContent = "";
  renderLogo(kind);
  refreshDerivedViews();
}

// --- Joukkuetietokanta -----------------------------------------------------

function applyDefaultHomeTeam() {
  const defaultEntry = teamCatalog.find((entry) => entry.nimi === getDefaultTeamName());

  if (defaultEntry) {
    refs["home-name-input"].value = defaultEntry.lyhytNimi;
    handleNameInput("home");
  }
}

async function initTeamCatalog() {
  teamCatalog = await loadTeamCatalog();

  const rememberedHomeName = preferences.homeName.trim();

  if (rememberedHomeName) {
    refs["home-name-input"].value = rememberedHomeName;
    handleNameInput("home");
  } else {
    applyDefaultHomeTeam();
  }

  const rememberedGuestName = preferences.guestName.trim();

  if (rememberedGuestName) {
    refs["guest-name-input"].value = rememberedGuestName;
    handleNameInput("guest");
  }

  const rememberedHomeName2 = preferences.homeName2.trim();

  if (rememberedHomeName2) {
    refs["home2-name-input"].value = rememberedHomeName2;
    handleNameInput("home2");
  }

  const rememberedGuestName2 = preferences.guestName2.trim();

  if (rememberedGuestName2) {
    refs["guest2-name-input"].value = rememberedGuestName2;
    handleNameInput("guest2");
  }
}

// --- Pienpeli-tila (neljä joukkuetta) ---------------------------------------

function updatePienpeliVisibility() {
  const enabled = state.pienpeli;

  setHidden(refs["pienpeli-teams-section"], !enabled);
  setHidden(refs["home-logo-field"], enabled);
  setHidden(refs["guest-logo-field"], enabled);

  document.querySelectorAll(".team-game-number").forEach((el) => {
    setHidden(el, !enabled);
  });
}

function handlePienpeliToggle(enabled) {
  state.pienpeli = enabled;
  savePreferences({ pienpeli: enabled });

  if (enabled) {
    removeLogo("home");
    removeLogo("guest");
  } else {
    // Pienpeli-tilassa ollessa logon haku on ohitettu, joten haetaan se nyt
    // uudelleen nimikentissä jo oleville joukkueille.
    handleNameInput("home");
    handleNameInput("guest");
  }

  updatePienpeliVisibility();
  refreshDerivedViews();
}

// --- Median muistaminen (IndexedDB) ---------------------------------------

function showInfoBanner(text, { showClearButton = false } = {}) {
  refs["media-cache-notice-text"].textContent = text;
  setHidden(refs["media-cache-clear-button"], !showClearButton);
  setHidden(refs["media-cache-notice"], false);
}

async function restoreCachedMedia() {
  requestPersistentStorage();

  const [adItems, goalItems, mediaItems] = await Promise.all([
    loadCachedCategory("ads"),
    loadCachedCategory("goal"),
    loadCachedCategory("media")
  ]);

  let hasRestoredAny = false;

  if (adItems.length > 0) {
    adItems.forEach((item) => {
      const file = cachedItemToFile(item);
      const entry = createFileEntry(file, {
        previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
      });
      state.ads.push(entry);
      restoredEntryIds.ads.add(entry.id);
    });
    renderAdsList();
    hasRestoredAny = true;
  }

  if (goalItems.length > 0) {
    const file = cachedItemToFile(goalItems[0]);
    const entry = createFileEntry(file, { previewUrl: URL.createObjectURL(file) });
    state.goalVideo = entry;
    restoredEntryIds.goal = entry.id;
    renderGoal();
    hasRestoredAny = true;
  }

  if (mediaItems.length > 0) {
    mediaItems.forEach((item) => {
      const file = cachedItemToFile(item);
      const entry = createFileEntry(file, {
        previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
      });
      state.media.push(entry);
      restoredEntryIds.media.add(entry.id);
    });
    renderMediaList();
    hasRestoredAny = true;
  }

  if (hasRestoredAny) {
    showInfoBanner("Palautettu edellisestä käyttökerrasta tietoja.", { showClearButton: true });
    refreshDerivedViews();
  }
}

// --- Oletusmediat (paketin mukana tulevat maalivideo ja media) -------------

const DEFAULT_MEDIA_DIRECTORY = "./media/";
const DEFAULT_GOAL_VIDEO_FILENAME = "goal.mp4";
const DEFAULT_MEDIA_FILENAMES = ["kunniota_pelia.mp4"];

async function fetchDefaultMediaFile(filename) {
  const url = `${DEFAULT_MEDIA_DIRECTORY}${encodeURIComponent(filename)}`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (response.ok) {
      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type || "video/mp4" });
    }
  } catch {
    // Oletusmediaa ei löytynyt tai verkkovirhe; jatketaan ilman sitä.
  }

  return null;
}

async function loadDefaultMedia() {
  if (!state.goalVideo) {
    const file = await fetchDefaultMediaFile(DEFAULT_GOAL_VIDEO_FILENAME);

    if (file) {
      state.goalVideo = createFileEntry(file, { previewUrl: URL.createObjectURL(file) });
      renderGoal();
    }
  }

  for (const filename of DEFAULT_MEDIA_FILENAMES) {
    const alreadyPresent = state.media.some((entry) => entry.file.name === filename);

    if (alreadyPresent) {
      continue;
    }

    const file = await fetchDefaultMediaFile(filename);

    if (file) {
      state.media.push(
        createFileEntry(file, {
          previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
        })
      );
    }
  }

  renderMediaList();
  refreshDerivedViews();
}

function discardRestoredGuestName() {
  lastAutoLogoKey.guest = null;
  closeSuggestions("guest");
  refs["guest-name-status"].textContent = "";
  refs["guest-name-input"].value = "";
  refs["guest-name-counter"].textContent = "0 / 8";
  setFieldError(refs["guest-name-error"], "");
  touched.guest = false;
  state.guestName = "";
  savePreferences({ guestName: "" });
}

async function discardRestoredMedia() {
  discardRestoredGuestName();

  state.ads = state.ads.filter((entry) => {
    if (restoredEntryIds.ads.has(entry.id)) {
      revokeEntryPreview(entry);
      return false;
    }
    return true;
  });

  state.media = state.media.filter((entry) => {
    if (restoredEntryIds.media.has(entry.id)) {
      revokeEntryPreview(entry);
      return false;
    }
    return true;
  });

  if (restoredEntryIds.goal && state.goalVideo && state.goalVideo.id === restoredEntryIds.goal) {
    revokeEntryPreview(state.goalVideo);
    state.goalVideo = null;
  }

  restoredEntryIds.ads.clear();
  restoredEntryIds.media.clear();
  restoredEntryIds.goal = null;

  renderAdsList();
  renderGoal();
  renderMediaList();

  await clearAllCachedMedia();
  persistAdOrder();
  persistAdsCache();
  persistMediaCache();
  persistGoalCache();

  setHidden(refs["media-cache-notice"], true);
  refreshDerivedViews();
}

// --- Konfiguraation vienti ja tuonti ---------------------------------------

function handleExportConfiguration() {
  const blob = exportConfigurationBlob(state);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = buildExportFileName(state);
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function countPlanItems(plan) {
  return plan.home.length + plan.guest.length + plan.ads.length + plan.goal.length + plan.media.length;
}

async function handleExportZip() {
  if (isExportingZip || state.isWriting) {
    return;
  }

  const missing = getMissingRequirements();

  if (missing.length > 0) {
    window.alert(
      `Zip-tiedostoa ei voitu luoda, koska seuraavat pakolliset tiedot puuttuvat tai ovat virheellisiä: ${missing.join(", ")}.`
    );
    return;
  }

  hideResultViews();
  clearProgress();
  closeSuggestions("home");
  closeSuggestions("guest");
  closeSuggestions("home2");
  closeSuggestions("guest2");
  setFormDisabled(true);
  isExportingZip = true;
  updateWriteButtonState();
  showTransientNotice("Luodaan Zip-tiedostoa…");

  const plan = createWritePlan(state);
  const fileName = buildZipExportFileName(state);

  try {
    const blob = await createConfigurationZipBlob(plan, {
      onProgress: (index, total, filename) => {
        showTransientNotice(`Luodaan Zip-tiedostoa (${index} / ${total})… ${filename}`);
      }
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    clearProgress();
    await showZipSuccess(plan, { fileName, size: blob.size, entryCount: countPlanItems(plan) });
  } catch (error) {
    clearProgress();
    await showError(error, { method: "zip" });
  } finally {
    isExportingZip = false;
    setFormDisabled(false);
    updateWriteButtonState();
  }
}

async function applyImportedConfiguration(imported, fileName) {
  resetState(state);
  resetFormFields();

  refs["replace-existing-checkbox"].checked = imported.replaceExisting;
  state.replaceExisting = imported.replaceExisting;
  savePreferences({ replaceExisting: imported.replaceExisting });
  updateReplaceWarning();

  refs["pienpeli-checkbox"].checked = imported.pienpeli;
  handlePienpeliToggle(imported.pienpeli);

  refs["home-name-input"].value = imported.homeName;
  handleNameInput("home");

  refs["guest-name-input"].value = imported.guestName;
  handleNameInput("guest");

  refs["home2-name-input"].value = imported.homeName2;
  handleNameInput("home2");

  refs["guest2-name-input"].value = imported.guestName2;
  handleNameInput("guest2");

  if (!imported.pienpeli) {
    if (imported.files.homeLogo) {
      await handleLogoFiles("home", [imported.files.homeLogo]);
    }

    if (imported.files.guestLogo) {
      await handleLogoFiles("guest", [imported.files.guestLogo]);
    }
  }

  imported.files.ads.forEach((file) => {
    state.ads.push(
      createFileEntry(file, {
        previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
      })
    );
  });
  renderAdsList();
  persistAdOrder();
  persistAdsCache();

  if (imported.files.goal) {
    state.goalVideo = createFileEntry(imported.files.goal, {
      previewUrl: URL.createObjectURL(imported.files.goal)
    });
    renderGoal();
    persistGoalCache();
  }

  imported.files.media.forEach((file) => {
    state.media.push(
      createFileEntry(file, {
        previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
      })
    );
  });
  renderMediaList();
  persistMediaCache();

  importInfo = { fileName, importedAt: new Date() };

  refreshDerivedViews();
  showInfoBanner(`Konfiguraatio tuotu tiedostosta "${fileName}".`);
}

async function handleImportFile(fileList) {
  const file = fileList && fileList[0];

  if (!file) {
    return;
  }

  const confirmed = window.confirm(
    "Tuominen korvaa nykyisen lomakkeen tiedot kokonaan (nimet, logot, mainokset, maalivideon ja muut mediat). Jatketaanko?"
  );

  if (!confirmed) {
    return;
  }

  try {
    const imported = await parseConfigurationFile(file);
    await applyImportedConfiguration(imported, file.name);
  } catch (error) {
    showTransientNotice(
      error && error.message
        ? `Konfiguraation tuonti epäonnistui: ${error.message}`
        : "Konfiguraation tuonti epäonnistui."
    );
  }
}

function closePageMenu() {
  setHidden(refs["page-menu-list"], true);
  refs["page-menu-button"].setAttribute("aria-expanded", "false");
}

function openPageMenu() {
  setHidden(refs["page-menu-list"], false);
  refs["page-menu-button"].setAttribute("aria-expanded", "true");
}

function togglePageMenu() {
  const isOpen = refs["page-menu-button"].getAttribute("aria-expanded") === "true";

  if (isOpen) {
    closePageMenu();
  } else {
    openPageMenu();
  }
}

// --- Mainokset -------------------------------------------------------------

function deriveTypeLabel(file) {
  const extension = extOf(file.name);

  if ([".png", ".jpg", ".jpeg"].includes(extension)) {
    return "Kuva";
  }

  if (extension === ".mp4") {
    return "Video";
  }

  if (extension === ".mp3" || extension === ".wav") {
    return "Ääni";
  }

  return file.type || "Tiedosto";
}

function isImageFile(file) {
  const extension = extOf(file.name);
  return [".png", ".jpg", ".jpeg"].includes(extension);
}

function isVideoFile(file) {
  return extOf(file.name) === ".mp4";
}

function isAudioFile(file) {
  const extension = extOf(file.name);
  return extension === ".mp3" || extension === ".wav";
}

function isPreviewableFile(file) {
  return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}

function handleAdFiles(fileList) {
  const errorEl = refs["ad-error"];
  let firstError = "";

  let files = Array.from(fileList || []);

  if (state.ads.length === 0 && rememberedAdOrder.length > 0) {
    files = sortFilesByRememberedOrder(files, rememberedAdOrder);
  }

  files.forEach((file) => {
    const message = validateAdFile(file);

    if (message) {
      firstError = firstError || message;
      return;
    }

    const entry = createFileEntry(file, {
      previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
    });

    state.ads.push(entry);
  });

  setFieldError(errorEl, firstError);
  renderAdsList();
  persistAdOrder();
  persistAdsCache();
  refreshDerivedViews();
}

function moveEntry(list, id, direction) {
  const index = list.findIndex((entry) => entry.id === id);
  const targetIndex = index + direction;

  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return;
  }

  const [entry] = list.splice(index, 1);
  list.splice(targetIndex, 0, entry);
}

function reorderListByDrag(list, draggedId, targetId, insertAfter) {
  const fromIndex = list.findIndex((entry) => entry.id === draggedId);

  if (fromIndex === -1) {
    return;
  }

  const [entry] = list.splice(fromIndex, 1);
  let targetIndex = targetId ? list.findIndex((item) => item.id === targetId) : list.length;

  if (targetIndex === -1) {
    targetIndex = list.length;
  }

  if (insertAfter) {
    targetIndex += 1;
  }

  list.splice(targetIndex, 0, entry);
}

function clearDragOverIndicators(kind) {
  const listEl = kind === "ads" ? refs["ads-list"] : refs["media-list"];

  listEl.querySelectorAll(".drag-over-before, .drag-over-after").forEach((el) => {
    el.classList.remove("drag-over-before", "drag-over-after");
  });
}

function buildDragHandle(entry, kind, li) {
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.title = "Raahaa järjestääksesi";
  handle.textContent = "⠿";
  handle.draggable = true;

  handle.addEventListener("dragstart", (event) => {
    dragState = { kind, id: entry.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
    li.classList.add("dragging");
  });

  handle.addEventListener("dragend", () => {
    dragState = null;
    li.classList.remove("dragging");
    clearDragOverIndicators(kind);
  });

  return handle;
}

function removeEntry(list, id) {
  const index = list.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return;
  }

  const [entry] = list.splice(index, 1);
  revokeEntryPreview(entry);
}

function buildThumbnailElement(entry) {
  const thumb = document.createElement("div");
  thumb.className = "file-list-thumb";

  if (!entry.previewUrl) {
    thumb.textContent = deriveTypeLabel(entry.file);
    return thumb;
  }

  if (isImageFile(entry.file)) {
    const img = document.createElement("img");
    img.src = entry.previewUrl;
    img.alt = "";
    thumb.appendChild(img);
    return thumb;
  }

  if (isVideoFile(entry.file)) {
    thumb.classList.add("file-list-thumb-media");
    const video = document.createElement("video");
    video.src = entry.previewUrl;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    thumb.appendChild(video);
    return thumb;
  }

  if (isAudioFile(entry.file)) {
    thumb.classList.add("file-list-thumb-media");
    const audio = document.createElement("audio");
    audio.src = entry.previewUrl;
    audio.controls = true;
    audio.preload = "metadata";
    thumb.appendChild(audio);
    return thumb;
  }

  thumb.textContent = deriveTypeLabel(entry.file);
  return thumb;
}

function buildFileListItem(entry, index, total, options) {
  const li = document.createElement("li");
  li.className = "file-list-item";

  const thumb = buildThumbnailElement(entry);

  const info = document.createElement("div");
  info.className = "file-list-info";

  const orderLabel = document.createElement("p");
  orderLabel.className = "file-list-order";
  orderLabel.textContent = options.showOrder ? `Järjestys: ${index + 1} / ${total}` : "";

  const name = document.createElement("p");
  name.className = "file-name";
  name.textContent = entry.file.name;

  const meta = document.createElement("p");
  meta.className = "file-meta";
  meta.textContent = `${deriveTypeLabel(entry.file)} · ${formatFileSize(entry.file.size)}`;

  info.appendChild(orderLabel);
  info.appendChild(name);
  info.appendChild(meta);

  if (isLargeFile(entry.file)) {
    const warning = document.createElement("p");
    warning.className = "warning-text";
    warning.textContent = LARGE_FILE_WARNING_TEXT;
    info.appendChild(warning);
  }

  const controls = document.createElement("div");
  controls.className = "file-list-controls";

  const sanitizedLabel = sanitizeFileName(entry.file.name);

  if (options.showMoveControls !== false) {
    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "icon-button";
    upButton.textContent = "▲";
    upButton.setAttribute("aria-label", `Siirrä tiedostoa ${sanitizedLabel} ylöspäin`);
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => options.onMove(entry.id, -1));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "icon-button";
    downButton.textContent = "▼";
    downButton.setAttribute("aria-label", `Siirrä tiedostoa ${sanitizedLabel} alaspäin`);
    downButton.disabled = index === total - 1;
    downButton.addEventListener("click", () => options.onMove(entry.id, 1));

    controls.appendChild(upButton);
    controls.appendChild(downButton);
  }

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "icon-button";
  removeButton.textContent = "✕";
  removeButton.setAttribute("aria-label", `Poista tiedosto ${sanitizedLabel}`);
  removeButton.addEventListener("click", () => options.onRemove(entry.id));

  controls.appendChild(removeButton);

  if (options.dragKind) {
    li.appendChild(buildDragHandle(entry, options.dragKind, li));
  }

  li.appendChild(thumb);
  li.appendChild(info);
  li.appendChild(controls);

  if (options.dragKind) {
    li.addEventListener("dragover", (event) => {
      if (!dragState || dragState.kind !== options.dragKind || dragState.id === entry.id) {
        return;
      }

      event.preventDefault();
      const rect = li.getBoundingClientRect();
      const insertAfter = event.clientY - rect.top > rect.height / 2;
      clearDragOverIndicators(options.dragKind);
      li.classList.add(insertAfter ? "drag-over-after" : "drag-over-before");
    });

    li.addEventListener("dragleave", () => {
      li.classList.remove("drag-over-before", "drag-over-after");
    });

    li.addEventListener("drop", (event) => {
      if (!dragState || dragState.kind !== options.dragKind) {
        return;
      }

      event.preventDefault();
      const rect = li.getBoundingClientRect();
      const insertAfter = event.clientY - rect.top > rect.height / 2;
      const draggedId = dragState.id;

      dragState = null;
      clearDragOverIndicators(options.dragKind);

      if (draggedId !== entry.id && options.onReorderDrop) {
        options.onReorderDrop(draggedId, entry.id, insertAfter);
      }
    });
  }

  return li;
}

function renderAdsList() {
  const list = refs["ads-list"];
  list.innerHTML = "";

  state.ads.forEach((entry, index) => {
    list.appendChild(
      buildFileListItem(entry, index, state.ads.length, {
        showOrder: true,
        dragKind: "ads",
        onMove: (id, direction) => {
          moveEntry(state.ads, id, direction);
          renderAdsList();
          persistAdOrder();
          persistAdsCache();
          refreshDerivedViews();
        },
        onRemove: (id) => {
          removeEntry(state.ads, id);
          restoredEntryIds.ads.delete(id);
          renderAdsList();
          persistAdOrder();
          persistAdsCache();
          refreshDerivedViews();
        },
        onReorderDrop: (draggedId, targetId, insertAfter) => {
          reorderListByDrag(state.ads, draggedId, targetId, insertAfter);
          renderAdsList();
          persistAdOrder();
          persistAdsCache();
          refreshDerivedViews();
        }
      })
    );
  });
}

// --- Maalivideo --------------------------------------------------------

function handleGoalFiles(fileList) {
  const file = fileList && fileList[0];
  const errorEl = refs["goal-error"];

  if (!file) {
    return;
  }

  const message = validateGoalVideoFile(file);

  if (message) {
    setFieldError(errorEl, message);
    return;
  }

  setFieldError(errorEl, "");

  if (state.goalVideo) {
    revokeEntryPreview(state.goalVideo);
  }

  restoredEntryIds.goal = null;
  state.goalVideo = createFileEntry(file, { previewUrl: URL.createObjectURL(file) });
  renderGoal();
  persistGoalCache();
  refreshDerivedViews();
}

function handleGoalFileSelection(fileList) {
  const file = fileList && fileList[0];

  if (!file) {
    return;
  }

  if (state.goalVideo) {
    const confirmed = window.confirm(
      "Maalivideo on jo valittu. Haluatko korvata sen uudella tiedostolla?"
    );

    if (!confirmed) {
      return;
    }
  }

  handleGoalFiles(fileList);
}

function renderGoal() {
  const list = refs["goal-list"];
  list.innerHTML = "";

  if (!state.goalVideo) {
    return;
  }

  list.appendChild(
    buildFileListItem(state.goalVideo, 0, 1, {
      showOrder: false,
      showMoveControls: false,
      onRemove: () => removeGoal()
    })
  );
}

function removeGoal() {
  if (state.goalVideo) {
    revokeEntryPreview(state.goalVideo);
  }

  state.goalVideo = null;
  restoredEntryIds.goal = null;
  refs["goal-input"].value = "";
  renderGoal();
  persistGoalCache();
  refreshDerivedViews();
}

// --- Muut mediat -----------------------------------------------------------

function handleMediaFiles(fileList) {
  const errorEl = refs["media-error"];
  let firstError = "";

  Array.from(fileList || []).forEach((file) => {
    const message = validateMediaFile(file);

    if (message) {
      firstError = firstError || message;
      return;
    }

    const entry = createFileEntry(file, {
      previewUrl: isPreviewableFile(file) ? URL.createObjectURL(file) : null
    });

    state.media.push(entry);
  });

  setFieldError(errorEl, firstError);
  renderMediaList();
  persistMediaCache();
  refreshDerivedViews();
}

function renderMediaList() {
  const list = refs["media-list"];
  list.innerHTML = "";

  state.media.forEach((entry, index) => {
    list.appendChild(
      buildFileListItem(entry, index, state.media.length, {
        showOrder: false,
        dragKind: "media",
        onMove: (id, direction) => {
          moveEntry(state.media, id, direction);
          renderMediaList();
          persistMediaCache();
          refreshDerivedViews();
        },
        onRemove: (id) => {
          removeEntry(state.media, id);
          restoredEntryIds.media.delete(id);
          renderMediaList();
          persistMediaCache();
          refreshDerivedViews();
        },
        onReorderDrop: (draggedId, targetId, insertAfter) => {
          reorderListByDrag(state.media, draggedId, targetId, insertAfter);
          renderMediaList();
          persistMediaCache();
          refreshDerivedViews();
        }
      })
    );
  });
}

// --- Hakemistorakenteen esikatselu ------------------------------------

function buildTreeText(plan) {
  const folders = [
    { name: "ad", items: plan.ads },
    { name: "goal", items: plan.goal },
    { name: "guest", items: plan.guest },
    { name: "home", items: plan.home },
    { name: "media", items: plan.media }
  ];

  const lines = ["dsbController/"];

  folders.forEach((folder, folderIndex) => {
    const isLastFolder = folderIndex === folders.length - 1;
    lines.push(`${isLastFolder ? "└── " : "├── "}${folder.name}/`);

    const sortedItems = folder.items
      .slice()
      .sort((a, b) => (a.kind === "text" ? 1 : 0) - (b.kind === "text" ? 1 : 0));

    sortedItems.forEach((item, itemIndex) => {
      const isLastItem = itemIndex === sortedItems.length - 1;
      const branchPrefix = isLastFolder ? "    " : "│   ";
      lines.push(`${branchPrefix}${isLastItem ? "└── " : "├── "}${item.targetName}`);
    });
  });

  return lines.join("\n");
}

function buildSummaryEntries() {
  const entries = [
    ["Kotijoukkue", state.homeName.trim() || "–"],
    ["Vierasjoukkue", state.guestName.trim() || "–"]
  ];

  entries.push(["Pienpeli-tila", state.pienpeli ? "Kyllä" : "Ei"]);

  if (state.pienpeli) {
    entries.push(["Kotijoukkue (peli 2)", state.homeName2.trim() || "–"]);
    entries.push(["Vierasjoukkue (peli 2)", state.guestName2.trim() || "–"]);
  }

  entries.push(
    ["Mainoksia", String(state.ads.length)],
    ["Maalivideo", state.goalVideo ? "Kyllä" : "Ei"],
    ["Muita medioita", String(state.media.length)]
  );

  return entries;
}

function renderSummary(targetEl, entries) {
  targetEl.innerHTML = "";

  entries.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    targetEl.appendChild(dt);
    targetEl.appendChild(dd);
  });
}

function collectAllFiles() {
  const files = [];

  if (!state.pienpeli) {
    if (state.homeLogo) files.push(state.homeLogo.file);
    if (state.guestLogo) files.push(state.guestLogo.file);
  }

  state.ads.forEach((entry) => files.push(entry.file));
  if (state.goalVideo) files.push(state.goalVideo.file);
  state.media.forEach((entry) => files.push(entry.file));

  return files;
}

function formatTotalsText() {
  const files = collectAllFiles();
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  return `Valittuja tiedostoja yhteensä: ${files.length} kpl, yhteiskoko ${formatFileSize(totalSize)}`;
}

function describeExportMethod(method) {
  return method === "zip"
    ? "Zip-tiedosto (ladattu selaimeen, siirrettävä ja purettava manuaalisesti USB-muistitikulle)"
    : "Suora kirjoitus USB-muistitikulle (File System Access API)";
}

async function buildCommonTechDetailsLines({ method, rootHandle } = {}) {
  const lines = [];

  lines.push(`Aikaleima: ${new Date().toLocaleString("fi-FI")}`);
  lines.push(`Selain: ${navigator.userAgent}`);
  lines.push(`Tallennustapa: ${describeExportMethod(method)}`);

  if (method === "zip") {
    lines.push("Kohdekansio: ei valittu (Zip-tiedosto ladataan selaimen omaan latauskansioon)");
  } else {
    lines.push(rootHandle ? `Kohdekansio: ${rootHandle.name}` : "Kohdekansio: ei valittu");

    if (rootHandle && typeof rootHandle.queryPermission === "function") {
      try {
        const permission = await rootHandle.queryPermission({ mode: "readwrite" });
        lines.push(`Kirjoitusoikeuden tila: ${permission}`);
      } catch {
        lines.push("Kirjoitusoikeuden tila: ei saatavilla");
      }
    }
  }

  if (isChromeOrEdgeBrowser() && navigator.storage && typeof navigator.storage.estimate === "function") {
    try {
      const estimate = await navigator.storage.estimate();

      if (typeof estimate.usage === "number" && typeof estimate.quota === "number") {
        lines.push(
          `Selaimen oma tallennustila (ei USB-tikku): ${formatFileSize(estimate.usage)} käytössä / ${formatFileSize(estimate.quota)} varattu`
        );
      }
    } catch {
      // Ei kriittinen, jätetään pois teknisistä tiedoista.
    }
  }

  if (isChromeOrEdgeBrowser() && navigator.storage && typeof navigator.storage.persisted === "function") {
    try {
      const persisted = await navigator.storage.persisted();
      lines.push(`Pysyvä tallennustila myönnetty: ${persisted ? "Kyllä" : "Ei"}`);
    } catch {
      // Ei kriittinen.
    }
  }

  lines.push(`Korvaa aiempi konfiguraatio: ${state.replaceExisting ? "Kyllä" : "Ei"}`);
  lines.push(
    importInfo
      ? `Tuotu tiedostosta: ${importInfo.fileName} (${importInfo.importedAt.toLocaleString("fi-FI")})`
      : "Tuotu tiedostosta: Ei"
  );

  buildSummaryEntries().forEach(([label, value]) => lines.push(`${label}: ${value}`));
  lines.push(formatTotalsText());

  return lines;
}

async function buildTechDetailsText(rootHandle, plan) {
  const lines = await buildCommonTechDetailsLines({ method: "usb", rootHandle });

  lines.push("");
  lines.push("Hakemistorakenne:");
  lines.push(buildTreeText(plan));

  return lines.join("\n");
}

async function buildZipTechDetailsText(plan, zipInfo) {
  const lines = await buildCommonTechDetailsLines({ method: "zip" });

  lines.push(`Zip-tiedoston nimi: ${zipInfo.fileName}`);
  lines.push(`Zip-tiedoston koko: ${formatFileSize(zipInfo.size)}`);
  lines.push(`Zip-tiedoston sisältämien tiedostojen määrä: ${zipInfo.entryCount} kpl`);

  lines.push("");
  lines.push("Zip-tiedoston hakemistorakenne:");
  lines.push(buildTreeText(plan));

  return lines.join("\n");
}

async function buildErrorTechDetailsText(method, rootHandle, error) {
  const lines = await buildCommonTechDetailsLines({ method, rootHandle });

  const technicalName =
    (error && error.originalError && error.originalError.name) || (error && error.name) || "Tuntematon";
  const technicalMessage =
    (error && error.originalError && error.originalError.message) || (error && error.message) || "";

  lines.push("");
  lines.push(`Virheen tyyppi: ${technicalName}`);
  lines.push(`Virheen kuvaus: ${technicalMessage}`);

  if (error && error.filename) {
    lines.push(`Epäonnistunut tiedosto: ${error.filename}`);
  }

  return lines.join("\n");
}

function refreshDerivedViews() {
  updateWriteButtonState();
}

// --- Kirjoituspainikkeen tila -------------------------------------------

function getMissingRequirements() {
  const missing = [];

  if (validateTeamName(state.homeName)) {
    missing.push("kotijoukkueen nimi");
  }

  if (validateTeamName(state.guestName)) {
    missing.push("vierasjoukkueen nimi");
  }

  if (state.pienpeli) {
    if (validateTeamName(state.homeName2)) {
      missing.push("kotijoukkueen nimi (peli 2)");
    }

    if (validateTeamName(state.guestName2)) {
      missing.push("vierasjoukkueen nimi (peli 2)");
    }
  } else {
    if (validateLogoFile(state.homeLogo ? state.homeLogo.file : null)) {
      missing.push("kotijoukkueen logo");
    }

    if (validateLogoFile(state.guestLogo ? state.guestLogo.file : null)) {
      missing.push("vierasjoukkueen logo");
    }
  }

  return missing;
}

function isFormValid() {
  return getMissingRequirements().length === 0;
}

function updateWriteButtonState() {
  const supported = isFileSystemAccessSupported();
  const missing = getMissingRequirements();
  const isBusy = state.isWriting || isExportingZip;
  const button = refs["write-button"];

  button.textContent = supported ? "Valitse USB-muistitikku ja kirjoita tiedostot" : "Tallenna Zip-tiedosto";
  button.disabled = isBusy || missing.length > 0;

  const hintEl = refs["write-button-hint"];

  if (isBusy) {
    hintEl.textContent = "Toiminto on käynnissä, painike on tilapäisesti pois käytöstä.";
  } else if (missing.length > 0) {
    hintEl.textContent =
      `Painike on pois käytöstä, koska seuraavat pakolliset tiedot puuttuvat tai ovat virheellisiä: ${missing.join(", ")}.`;
  } else {
    hintEl.textContent = "";
  }
}

// --- Kentät ja tiedostojen valinta kirjoituksen ajaksi ------------------

function setFormDisabled(disabled) {
  const form = refs["configuration-form"];
  form.querySelectorAll("input, button, select").forEach((el) => {
    el.disabled = disabled;
  });
}

// --- Etenemisen näyttäminen -----------------------------------------------

function getProgressMessage(phase, info) {
  switch (phase) {
    case "creating-directories":
      return "Luodaan kansiorakennetta…";
    case "clearing-directories":
      return "Tyhjennetään aiempaa konfiguraatiota…";
    case "writing-team-data":
      return "Kirjoitetaan joukkueiden tietoja…";
    case "writing-ads":
      return `Kirjoitetaan mainoksia ${info.index} / ${info.total}…`;
    case "writing-goal-video":
      return "Kirjoitetaan maalivideota…";
    case "writing-media":
      return `Kirjoitetaan muita medioita ${info.index} / ${info.total}…`;
    case "verifying":
      return "Tarkistetaan tiedostoja…";
    default:
      return "";
  }
}

function renderProgress(phase, info) {
  const region = refs["progress-region"];
  setHidden(region, false);
  refs["progress-text"].textContent = getProgressMessage(phase, info);
  refs["progress-count"].textContent = info && info.filename ? `Tiedosto: ${info.filename}` : "";
}

function showTransientNotice(text) {
  const region = refs["progress-region"];
  setHidden(region, false);
  refs["progress-text"].textContent = text;
  refs["progress-count"].textContent = "";
}

function clearProgress() {
  setHidden(refs["progress-region"], true);
  refs["progress-text"].textContent = "";
  refs["progress-count"].textContent = "";
}

// --- Onnistuminen ja virheet ---------------------------------------------

function hideResultViews() {
  setHidden(refs["success-view"], true);
  setHidden(refs["error-view"], true);
}

function resetTechDetailsToggle(buttonRef, wrapRef) {
  setHidden(wrapRef, true);
  buttonRef.setAttribute("aria-expanded", "false");
  buttonRef.textContent = "Näytä tekniset tiedot";
}

function wireTechDetailsToggle(buttonRef, wrapRef) {
  buttonRef.addEventListener("click", () => {
    const isExpanded = buttonRef.getAttribute("aria-expanded") === "true";
    const nowExpanded = !isExpanded;

    setHidden(wrapRef, !nowExpanded);
    buttonRef.setAttribute("aria-expanded", String(nowExpanded));
    buttonRef.textContent = nowExpanded ? "Piilota tekniset tiedot" : "Näytä tekniset tiedot";
  });
}

async function copyTechDetails(textareaRef, copyButtonRef) {
  const originalLabel = "Kopioi tekniset tiedot";

  try {
    await navigator.clipboard.writeText(textareaRef.value);
    copyButtonRef.textContent = "✅ Kopioitu leikepöydälle";
  } catch {
    textareaRef.focus();
    textareaRef.select();
    copyButtonRef.textContent = "Kopiointi epäonnistui, teksti valittu";
  }

  window.setTimeout(() => {
    copyButtonRef.textContent = originalLabel;
  }, 2000);
}

function wireCopyButton(copyButtonRef, textareaRef) {
  copyButtonRef.addEventListener("click", () => {
    copyTechDetails(textareaRef, copyButtonRef);
  });
}

async function showSuccess(rootHandle, plan) {
  hideResultViews();
  lastExportMethod = "usb";
  renderSummary(refs["success-summary"], buildSummaryEntries());

  refs["success-heading"].textContent = "Konfiguraatio kirjoitettiin onnistuneesti.";
  refs["success-instructions"].textContent =
    "Odota vielä hetki, jotta käyttöjärjestelmä ehtii viimeistellä kirjoituksen. Poista muistitikku sen jälkeen hallitusti käyttöjärjestelmän Poista laite- tai Eject-toiminnolla.";
  refs["rewrite-configuration-button"].textContent = "Kirjoita sama konfiguraatio uudelleen";

  refs["success-tech-details-textarea"].value = await buildTechDetailsText(rootHandle, plan);
  resetTechDetailsToggle(refs["success-tech-details-button"], refs["success-tech-details-wrap"]);

  setHidden(refs["success-view"], false);
  refs["success-view"].focus();
}

async function showZipSuccess(plan, zipInfo) {
  hideResultViews();
  lastExportMethod = "zip";
  renderSummary(refs["success-summary"], buildSummaryEntries());

  refs["success-heading"].textContent = "Zip-tiedosto luotiin onnistuneesti.";
  refs["success-instructions"].textContent =
    `Zip-tiedosto "${zipInfo.fileName}" ladattiin selaimeen. Siirrä tiedosto USB-muistitikulle ja pura se siellä manuaalisesti niin, että purkamisessa syntyvä dsbController-kansio tulee suoraan USB-muistitikun juureen. Poista muistitikku lopuksi hallitusti käyttöjärjestelmän Poista laite- tai Eject-toiminnolla.`;
  refs["rewrite-configuration-button"].textContent = "Luo sama Zip-tiedosto uudelleen";

  refs["success-tech-details-textarea"].value = await buildZipTechDetailsText(plan, zipInfo);
  resetTechDetailsToggle(refs["success-tech-details-button"], refs["success-tech-details-wrap"]);

  setHidden(refs["success-view"], false);
  refs["success-view"].focus();
}

function mapErrorToMessage(error) {
  if (error && error.filename) {
    return error.message;
  }

  if (error && error.name === "NotAllowedError") {
    return "Selaimelle ei myönnetty kirjoitusoikeutta valittuun kansioon. Valitse kansio uudelleen ja hyväksy kirjoitusoikeus.";
  }

  if (error && error.name === "QuotaExceededError") {
    return "Tiedostojen kirjoittaminen epäonnistui. USB-muistitikulla ei ehkä ole riittävästi vapaata tilaa.";
  }

  if (error && ["NotFoundError", "NotReadableError", "InvalidStateError"].includes(error.name)) {
    return "Kirjoittaminen keskeytyi. USB-muistitikku saatettiin irrottaa kesken kirjoituksen. Liitä muistitikku uudelleen ja kirjoita konfiguraatio alusta.";
  }

  return "Tiedostojen kirjoittaminen epäonnistui.";
}

function mapZipErrorToMessage() {
  return "Zip-tiedoston luominen epäonnistui.";
}

async function showError(error, { method = "usb", rootHandle } = {}) {
  hideResultViews();
  clearProgress();

  refs["error-message"].textContent = method === "zip" ? mapZipErrorToMessage(error) : mapErrorToMessage(error);

  refs["error-tech-details-textarea"].value = await buildErrorTechDetailsText(method, rootHandle, error);
  resetTechDetailsToggle(refs["error-tech-details-button"], refs["error-tech-details-wrap"]);

  setHidden(refs["error-view"], false);
  refs["error-view"].focus();
}

// --- Kirjoitusprosessi -----------------------------------------------------

async function runWriteProcess(rootHandle) {
  hideResultViews();
  clearProgress();
  closeSuggestions("home");
  closeSuggestions("guest");
  closeSuggestions("home2");
  closeSuggestions("guest2");
  setFormDisabled(true);
  state.isWriting = true;
  state.writeStatus = "creating-directories";
  updateWriteButtonState();
  renderProgress("creating-directories", {});

  const plan = createWritePlan(state);

  try {
    await writeConfiguration(rootHandle, plan, {
      replaceExisting: state.replaceExisting,
      onProgress: (phase, info) => {
        state.writeStatus = phase;
        renderProgress(phase, info);
      }
    });

    state.writeStatus = "success";
    state.writeError = null;
    clearProgress();
    await showSuccess(rootHandle, plan);
  } catch (error) {
    state.writeStatus = "error";
    state.writeError = error;
    await showError(error, { method: "usb", rootHandle });
  } finally {
    state.isWriting = false;
    setFormDisabled(false);
    updateWriteButtonState();
  }
}

async function handleDirectoryConfirmProceed() {
  let rootHandle;

  try {
    rootHandle = await pickRootDirectory();
  } catch (error) {
    refs["directory-confirm-dialog"].close();

    if (error && error.name === "AbortError") {
      showTransientNotice("Kansion valinta peruutettiin. Tiedostoja ei kirjoitettu.");
      return;
    }

    await showError(error, { method: "usb" });
    return;
  }

  refs["directory-confirm-dialog"].close();
  await runWriteProcess(rootHandle);
}

function openDirectoryConfirmDialog() {
  hideResultViews();
  clearProgress();
  refs["directory-confirm-dialog"].showModal();
}

function openZipConfirmDialog() {
  hideResultViews();
  clearProgress();
  refs["zip-confirm-dialog"].showModal();
}

// --- Lomakkeen tyhjennys ja uudelleenkäyttö -------------------------------

function resetFormFields() {
  lastAutoLogoKey.home = null;
  lastAutoLogoKey.guest = null;

  ["home", "guest", "home2", "guest2"].forEach((kind) => {
    closeSuggestions(kind);
    refs[`${kind}-name-status`].textContent = "";
    refs[`${kind}-name-input`].value = "";
    refs[`${kind}-name-counter`].textContent = "0 / 8";
    setFieldError(refs[`${kind}-name-error`], "");
    touched[kind] = false;
  });

  refs["home-logo-input"].value = "";
  refs["guest-logo-input"].value = "";
  setFieldError(refs["home-logo-error"], "");
  setFieldError(refs["guest-logo-error"], "");
  renderLogo("home");
  renderLogo("guest");

  refs["pienpeli-checkbox"].checked = false;
  handlePienpeliToggle(false);

  refs["ad-input"].value = "";
  setFieldError(refs["ad-error"], "");
  renderAdsList();

  refs["goal-input"].value = "";
  setFieldError(refs["goal-error"], "");
  renderGoal();

  refs["media-input"].value = "";
  setFieldError(refs["media-error"], "");
  renderMediaList();

  refs["replace-existing-checkbox"].checked = true;
  state.replaceExisting = true;
  updateReplaceWarning();

  refreshDerivedViews();
}

function updateReplaceWarning() {
  setHidden(refs["replace-warning"], state.replaceExisting);
}

// --- Raahaa ja pudota ------------------------------------------------------

function wireDropzone(dropzoneEl, onFiles) {
  const activate = () => dropzoneEl.classList.add("dropzone-active");
  const deactivate = () => dropzoneEl.classList.remove("dropzone-active");

  dropzoneEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    activate();
  });

  dropzoneEl.addEventListener("dragleave", () => {
    deactivate();
  });

  dropzoneEl.addEventListener("drop", (event) => {
    event.preventDefault();
    deactivate();
    onFiles(event.dataTransfer.files);
  });
}

// --- Alustus ----------------------------------------------------------------

export function initApp() {
  cacheRefs();

  if (!isFileSystemAccessSupported()) {
    setHidden(refs["fsa-warning"], false);
  }

  refs["configuration-form"].addEventListener("submit", (event) => {
    event.preventDefault();
  });

  refs["page-menu-button"].addEventListener("click", () => {
    togglePageMenu();
  });

  document.addEventListener("click", (event) => {
    if (
      !refs["page-menu-button"].contains(event.target) &&
      !refs["page-menu-list"].contains(event.target)
    ) {
      closePageMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePageMenu();
    }
  });

  refs["export-configuration-button"].addEventListener("click", () => {
    closePageMenu();
    handleExportConfiguration();
  });

  refs["import-configuration-button"].addEventListener("click", () => {
    closePageMenu();
    refs["import-configuration-input"].click();
  });

  refs["export-zip-button"].addEventListener("click", () => {
    closePageMenu();
    openZipConfirmDialog();
  });

  refs["import-configuration-input"].addEventListener("change", (event) => {
    handleImportFile(event.target.files);
    event.target.value = "";
  });

  if (preferences.replaceExisting === false) {
    refs["replace-existing-checkbox"].checked = false;
    state.replaceExisting = false;
  }

  if (preferences.pienpeli) {
    refs["pienpeli-checkbox"].checked = true;
  }
  handlePienpeliToggle(refs["pienpeli-checkbox"].checked);

  initTeamCatalog();
  restoreCachedMedia().then(loadDefaultMedia);

  refs["media-cache-clear-button"].addEventListener("click", () => {
    discardRestoredMedia();
  });

  refs["pienpeli-checkbox"].addEventListener("change", (event) => {
    handlePienpeliToggle(event.target.checked);
  });

  ["home", "guest", "home2", "guest2"].forEach((kind) => {
    const input = refs[`${kind}-name-input`];
    input.addEventListener("input", () => handleNameInput(kind));
    input.addEventListener("input", () => updateSuggestions(kind));
    input.addEventListener("keydown", (event) => handleNameInputKeydown(kind, event));
    input.addEventListener("blur", () => handleNameBlur(kind));
  });

  refs["home-logo-input"].addEventListener("change", (event) => {
    handleLogoFiles("home", event.target.files).finally(() => {
      event.target.value = "";
    });
  });
  refs["guest-logo-input"].addEventListener("change", (event) => {
    handleLogoFiles("guest", event.target.files).finally(() => {
      event.target.value = "";
    });
  });
  refs["home-logo-remove-button"].addEventListener("click", () => removeLogo("home"));
  refs["guest-logo-remove-button"].addEventListener("click", () => removeLogo("guest"));

  wireDropzone(refs["home-logo-dropzone"], (files) => {
    handleLogoFiles("home", files);
  });
  wireDropzone(refs["guest-logo-dropzone"], (files) => {
    handleLogoFiles("guest", files);
  });

  refs["ad-input"].addEventListener("change", (event) => {
    handleAdFiles(event.target.files);
    event.target.value = "";
  });
  wireDropzone(refs["ad-dropzone"], handleAdFiles);

  refs["goal-input"].addEventListener("change", (event) => {
    handleGoalFileSelection(event.target.files);
    event.target.value = "";
  });
  wireDropzone(refs["goal-dropzone"], handleGoalFileSelection);

  refs["media-input"].addEventListener("change", (event) => {
    handleMediaFiles(event.target.files);
    event.target.value = "";
  });
  wireDropzone(refs["media-dropzone"], handleMediaFiles);

  refs["replace-existing-checkbox"].addEventListener("change", (event) => {
    state.replaceExisting = event.target.checked;
    savePreferences({ replaceExisting: event.target.checked });
    updateReplaceWarning();
  });

  refs["write-button"].addEventListener("click", () => {
    if (isFileSystemAccessSupported()) {
      openDirectoryConfirmDialog();
    } else {
      openZipConfirmDialog();
    }
  });

  refs["directory-confirm-cancel-button"].addEventListener("click", () => {
    refs["directory-confirm-dialog"].close();
  });

  refs["directory-confirm-proceed-button"].addEventListener("click", () => {
    handleDirectoryConfirmProceed();
  });

  refs["zip-confirm-cancel-button"].addEventListener("click", () => {
    refs["zip-confirm-dialog"].close();
  });

  refs["zip-confirm-proceed-button"].addEventListener("click", () => {
    refs["zip-confirm-dialog"].close();
    handleExportZip();
  });

  wireTechDetailsToggle(refs["success-tech-details-button"], refs["success-tech-details-wrap"]);
  wireCopyButton(refs["success-tech-details-copy-button"], refs["success-tech-details-textarea"]);
  wireTechDetailsToggle(refs["error-tech-details-button"], refs["error-tech-details-wrap"]);
  wireCopyButton(refs["error-tech-details-copy-button"], refs["error-tech-details-textarea"]);

  refs["new-configuration-button"].addEventListener("click", () => {
    resetState(state);
    resetFormFields();
    clearPreferences();
    rememberedAdOrder = [];
    restoredEntryIds.ads.clear();
    restoredEntryIds.media.clear();
    restoredEntryIds.goal = null;
    importInfo = null;
    clearAllCachedMedia();
    setHidden(refs["media-cache-notice"], true);
    hideResultViews();
    applyDefaultHomeTeam();
  });

  refs["rewrite-configuration-button"].addEventListener("click", () => {
    hideResultViews();

    if (lastExportMethod === "zip") {
      openZipConfirmDialog();
    } else {
      openDirectoryConfirmDialog();
    }
  });

  refs["error-close-button"].addEventListener("click", () => {
    hideResultViews();
    state.writeStatus = "idle";
    state.writeError = null;
  });

  refs["home-name-counter"].textContent = "0 / 8";
  refs["guest-name-counter"].textContent = "0 / 8";
  refs["home2-name-counter"].textContent = "0 / 8";
  refs["guest2-name-counter"].textContent = "0 / 8";
  updateReplaceWarning();
  refreshDerivedViews();
}
