export function isFileSystemAccessSupported() {
  return "showDirectoryPicker" in window;
}

export async function verifyPermission(handle, readWrite = true) {
  const options = {};

  if (readWrite) {
    options.mode = "readwrite";
  }

  if (
    typeof handle.queryPermission === "function" &&
    (await handle.queryPermission(options)) === "granted"
  ) {
    return true;
  }

  if (
    typeof handle.requestPermission === "function" &&
    (await handle.requestPermission(options)) === "granted"
  ) {
    return true;
  }

  return false;
}

export async function pickRootDirectory() {
  return await window.showDirectoryPicker({
    mode: "readwrite"
  });
}

export async function getOrCreateDirectory(parent, name) {
  return await parent.getDirectoryHandle(name, {
    create: true
  });
}

export async function clearDirectory(directory) {
  for await (const [name] of directory.entries()) {
    await directory.removeEntry(name, {
      recursive: true
    });
  }
}

export async function writeFile(directory, filename, data) {
  const fileHandle = await directory.getFileHandle(filename, {
    create: true
  });

  const writable = await fileHandle.createWritable();

  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // Keskeytys epäonnistui, alkuperäinen virhe heitetään joka tapauksessa.
    }

    throw error;
  }
}

export async function ensureManagedDirectories(rootHandle) {
  const dsbController = await getOrCreateDirectory(rootHandle, "dsbController");

  const ad = await getOrCreateDirectory(dsbController, "ad");
  const goal = await getOrCreateDirectory(dsbController, "goal");
  const guest = await getOrCreateDirectory(dsbController, "guest");
  const home = await getOrCreateDirectory(dsbController, "home");
  const media = await getOrCreateDirectory(dsbController, "media");

  return { dsbController, ad, goal, guest, home, media };
}
