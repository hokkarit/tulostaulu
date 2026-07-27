export async function verifyFileSize(directory, filename, expectedSize) {
  const handle = await directory.getFileHandle(filename);
  const file = await handle.getFile();

  if (file.size !== expectedSize) {
    throw new Error(`Tiedoston ${filename} koko ei vastaa alkuperäistä tiedostoa.`);
  }
}

export async function verifyTextFile(directory, filename, expectedText) {
  const handle = await directory.getFileHandle(filename);
  const file = await handle.getFile();
  const content = await file.text();

  if (content !== expectedText) {
    throw new Error(`Tiedoston ${filename} sisältö ei vastaa odotettua.`);
  }
}

export async function verifyWriteResult(dirs, plan) {
  const homeNameItem = plan.home.find((item) => item.kind === "text");
  const homeLogoItem = plan.home.find((item) => item.kind === "binary");
  const guestNameItem = plan.guest.find((item) => item.kind === "text");
  const guestLogoItem = plan.guest.find((item) => item.kind === "binary");
  const goalItem = plan.goal[0];

  if (homeNameItem) {
    await verifyTextFile(dirs.home, homeNameItem.targetName, homeNameItem.content);
  }

  if (guestNameItem) {
    await verifyTextFile(dirs.guest, guestNameItem.targetName, guestNameItem.content);
  }

  if (homeLogoItem) {
    await verifyFileSize(dirs.home, homeLogoItem.targetName, homeLogoItem.expectedSize);
  }

  if (guestLogoItem) {
    await verifyFileSize(dirs.guest, guestLogoItem.targetName, guestLogoItem.expectedSize);
  }

  if (goalItem) {
    await verifyFileSize(dirs.goal, goalItem.targetName, goalItem.expectedSize);
  }
}
