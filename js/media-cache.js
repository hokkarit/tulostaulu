const DB_NAME = "tulostaulu-mediavarasto";
const DB_VERSION = 1;
const STORE_NAME = "kategoriat";

let dbPromise = null;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB ei ole käytettävissä tässä selaimessa."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function saveCachedCategory(category, files) {
  try {
    const db = await openDatabase();
    const items = files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      blob: file
    }));

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ id: category, items });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Tallennustilaa ei ole käytettävissä (esim. yksityinen selaus); ei kriittinen virhe.
  }
}

export async function loadCachedCategory(category) {
  try {
    const db = await openDatabase();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(category);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record && Array.isArray(record.items) ? record.items : []);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function clearCachedCategory(category) {
  try {
    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(category);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Ei kriittinen virhe.
  }
}

export async function clearAllCachedMedia() {
  await Promise.all([
    clearCachedCategory("ads"),
    clearCachedCategory("goal"),
    clearCachedCategory("media")
  ]);
}

export function cachedItemToFile(item) {
  return new File([item.blob], item.name, { type: item.type });
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      await navigator.storage.persist();
    }
  } catch {
    // Ei kriittinen virhe; sovellus toimii silti, tallennustila voi vain vapautua herkemmin.
  }
}
