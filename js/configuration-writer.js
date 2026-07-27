import { buildAdFileName, buildUniqueMediaName, buildLogoFileName } from "./file-names.js";
import { ensureManagedDirectories, clearDirectory, writeFile, verifyPermission } from "./file-system.js";
import { verifyWriteResult } from "./configuration-verifier.js";

const textEncoder = new TextEncoder();

export function createWritePlan(state) {
  const plan = {
    home: [],
    guest: [],
    ads: [],
    goal: [],
    media: []
  };

  const homeName = state.homeName.trim();
  const guestName = state.guestName.trim();

  plan.home.push({
    targetDir: "home",
    targetName: "nimi.txt",
    kind: "text",
    content: homeName,
    expectedSize: textEncoder.encode(homeName).length
  });

  plan.guest.push({
    targetDir: "guest",
    targetName: "nimi.txt",
    kind: "text",
    content: guestName,
    expectedSize: textEncoder.encode(guestName).length
  });

  if (state.homeLogo) {
    plan.home.push({
      targetDir: "home",
      targetName: buildLogoFileName("home", state.homeLogo.file),
      kind: "binary",
      sourceFile: state.homeLogo.file,
      expectedSize: state.homeLogo.file.size
    });
  }

  if (state.guestLogo) {
    plan.guest.push({
      targetDir: "guest",
      targetName: buildLogoFileName("guest", state.guestLogo.file),
      kind: "binary",
      sourceFile: state.guestLogo.file,
      expectedSize: state.guestLogo.file.size
    });
  }

  state.ads.forEach((entry, index) => {
    plan.ads.push({
      targetDir: "ad",
      targetName: buildAdFileName(index + 1, entry.file.name),
      kind: "binary",
      sourceFile: entry.file,
      expectedSize: entry.file.size
    });
  });

  if (state.goalVideo) {
    plan.goal.push({
      targetDir: "goal",
      targetName: "goal.mp4",
      kind: "binary",
      sourceFile: state.goalVideo.file,
      expectedSize: state.goalVideo.file.size
    });
  }

  const usedMediaNames = new Set();
  state.media.forEach((entry) => {
    const targetName = buildUniqueMediaName(usedMediaNames, entry.file.name);
    plan.media.push({
      targetDir: "media",
      targetName,
      kind: "binary",
      sourceFile: entry.file,
      expectedSize: entry.file.size
    });
  });

  return plan;
}

function buildWriteQueue(plan) {
  const homeNameItem = plan.home.find((item) => item.kind === "text");
  const homeLogoItem = plan.home.find((item) => item.kind === "binary");
  const guestNameItem = plan.guest.find((item) => item.kind === "text");
  const guestLogoItem = plan.guest.find((item) => item.kind === "binary");

  const teamDataItems = [homeNameItem, guestNameItem, homeLogoItem, guestLogoItem].filter(Boolean);

  return [
    ...teamDataItems.map((item) => ({ item, phase: "writing-team-data" })),
    ...plan.ads.map((item, index) => ({
      item,
      phase: "writing-ads",
      index: index + 1,
      total: plan.ads.length
    })),
    ...plan.goal.map((item) => ({ item, phase: "writing-goal-video" })),
    ...plan.media.map((item, index) => ({
      item,
      phase: "writing-media",
      index: index + 1,
      total: plan.media.length
    }))
  ];
}

export async function writeConfiguration(rootHandle, plan, { replaceExisting, onProgress }) {
  const hasPermission = await verifyPermission(rootHandle, true);

  if (!hasPermission) {
    const error = new Error("Kirjoitusoikeutta ei myönnetty.");
    error.name = "NotAllowedError";
    throw error;
  }

  onProgress?.("creating-directories", {});
  const dirs = await ensureManagedDirectories(rootHandle);

  if (replaceExisting) {
    onProgress?.("clearing-directories", {});
    await clearDirectory(dirs.ad);
    await clearDirectory(dirs.goal);
    await clearDirectory(dirs.guest);
    await clearDirectory(dirs.home);
    await clearDirectory(dirs.media);
  }

  const dirByName = {
    home: dirs.home,
    guest: dirs.guest,
    ad: dirs.ad,
    goal: dirs.goal,
    media: dirs.media
  };

  const queue = buildWriteQueue(plan);

  for (const entry of queue) {
    const { item } = entry;
    const directory = dirByName[item.targetDir];

    onProgress?.(entry.phase, {
      filename: item.targetName,
      index: entry.index,
      total: entry.total
    });

    try {
      const data = item.kind === "text" ? textEncoder.encode(item.content) : item.sourceFile;
      await writeFile(directory, item.targetName, data);
    } catch (error) {
      const wrapped = new Error(
        `Tiedoston "${item.targetName}" kirjoittaminen epäonnistui. Konfiguraatio voi olla keskeneräinen. Yritä uudelleen käyttäen asetusta "Korvaa aiempi ottelukonfiguraatio".`
      );
      wrapped.name = error.name;
      wrapped.originalError = error;
      wrapped.filename = item.targetName;
      throw wrapped;
    }
  }

  onProgress?.("verifying", {});
  await verifyWriteResult(dirs, plan);
}
