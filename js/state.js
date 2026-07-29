export function createInitialState() {
  return {
    homeName: "",
    guestName: "",
    homeLogo: null,
    guestLogo: null,
    pienpeli: false,
    homeName2: "",
    guestName2: "",
    ads: [],
    goalVideo: null,
    media: [],
    replaceExisting: true,
    isWriting: false,
    writeStatus: "idle",
    writeError: null
  };
}

export const state = createInitialState();

export function createFileEntry(file, extra = {}) {
  return {
    id: crypto.randomUUID(),
    file,
    sanitizedName: "",
    previewUrl: null,
    width: null,
    height: null,
    aspectRatio: null,
    ...extra
  };
}

export function revokeEntryPreview(entry) {
  if (entry && entry.previewUrl) {
    URL.revokeObjectURL(entry.previewUrl);
    entry.previewUrl = null;
  }
}

export function revokeAllPreviews(targetState) {
  if (targetState.homeLogo) {
    revokeEntryPreview(targetState.homeLogo);
  }

  if (targetState.guestLogo) {
    revokeEntryPreview(targetState.guestLogo);
  }

  targetState.ads.forEach(revokeEntryPreview);
  targetState.media.forEach(revokeEntryPreview);
}

export function resetState(targetState) {
  revokeAllPreviews(targetState);
  Object.assign(targetState, createInitialState());
}
