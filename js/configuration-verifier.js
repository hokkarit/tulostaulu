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

async function verifyTeamItem(directory, item) {
  if (item.kind === "text") {
    await verifyTextFile(directory, item.targetName, item.content);
  } else {
    await verifyFileSize(directory, item.targetName, item.expectedSize);
  }
}

export async function verifyWriteResult(dirs, plan) {
  for (const item of plan.home) {
    await verifyTeamItem(dirs.home, item);
  }

  for (const item of plan.guest) {
    await verifyTeamItem(dirs.guest, item);
  }

  const goalItem = plan.goal[0];

  if (goalItem) {
    await verifyFileSize(dirs.goal, goalItem.targetName, goalItem.expectedSize);
  }
}
