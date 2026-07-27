const STORAGE_KEY = "tulostaulu.viimeisimmat-asetukset";

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Tallennustila voi olla täynnä tai selain voi estää localStoragen käytön; ei kriittinen virhe.
  }
}

export function loadPreferences() {
  const stored = readStorage();

  return {
    homeName: typeof stored.homeName === "string" ? stored.homeName : "",
    guestName: typeof stored.guestName === "string" ? stored.guestName : "",
    replaceExisting: typeof stored.replaceExisting === "boolean" ? stored.replaceExisting : true,
    adNameOrder: Array.isArray(stored.adNameOrder)
      ? stored.adNameOrder.filter((name) => typeof name === "string")
      : []
  };
}

export function savePreferences(partial) {
  const current = readStorage();
  writeStorage({ ...current, ...partial });
}

export function clearPreferences() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ei kriittinen virhe.
  }
}
