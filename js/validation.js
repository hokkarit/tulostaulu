export function getVisibleLength(value) {
  return Array.from(value).length;
}

export function validateTeamName(value) {
  const trimmed = value.trim();
  const length = getVisibleLength(trimmed);

  if (length === 0) {
    return "Joukkueen nimi on pakollinen.";
  }

  if (length > 8) {
    return "Joukkueen nimi saa olla enintään 8 merkkiä.";
  }

  return "";
}

export function getFileExtension(filename) {
  const match = /\.[^./\\]+$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

const LOGO_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const LOGO_MIME_TYPES = ["image/png", "image/jpeg"];

export function validateLogoFile(file) {
  if (!file) {
    return "Logo on pakollinen.";
  }

  const extension = getFileExtension(file.name);

  if (!LOGO_EXTENSIONS.includes(extension)) {
    return "Logon tulee olla PNG-, JPG- tai JPEG-tiedosto.";
  }

  if (file.type && !LOGO_MIME_TYPES.includes(file.type)) {
    return "Logon tulee olla PNG-, JPG- tai JPEG-tiedosto.";
  }

  return "";
}

export function validateGoalVideoFile(file) {
  if (!file) {
    return "";
  }

  const extension = getFileExtension(file.name);

  if (extension !== ".mp4") {
    return "Maalivideon tulee olla .mp4-tiedosto.";
  }

  if (file.type && file.type !== "video/mp4") {
    return "Maalivideon tulee olla .mp4-tiedosto.";
  }

  return "";
}

const AD_EXTENSIONS = [".png", ".jpg", ".jpeg", ".mp4"];
const AD_MIME_TYPES = ["image/png", "image/jpeg", "video/mp4"];

export function validateAdFile(file) {
  const extension = getFileExtension(file.name);

  if (!AD_EXTENSIONS.includes(extension)) {
    return "Mainoksen tulee olla PNG-, JPG-, JPEG- tai MP4-tiedosto.";
  }

  if (file.type && !AD_MIME_TYPES.includes(file.type)) {
    return "Mainoksen tulee olla PNG-, JPG-, JPEG- tai MP4-tiedosto.";
  }

  return "";
}

const MEDIA_EXTENSIONS = [".mp4", ".png", ".jpg", ".jpeg", ".mp3", ".wav"];
const MEDIA_MIME_TYPES = [
  "video/mp4",
  "image/png",
  "image/jpeg",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav"
];

export function validateMediaFile(file) {
  const extension = getFileExtension(file.name);

  if (!MEDIA_EXTENSIONS.includes(extension)) {
    return "Median tulee olla MP4-, PNG-, JPG-, JPEG-, MP3- tai WAV-tiedosto.";
  }

  if (file.type && !MEDIA_MIME_TYPES.includes(file.type)) {
    return "Median tulee olla MP4-, PNG-, JPG-, JPEG-, MP3- tai WAV-tiedosto.";
  }

  return "";
}

const LARGE_FILE_THRESHOLD_BYTES = 500 * 1024 * 1024;

export function isLargeFile(file) {
  return file.size > LARGE_FILE_THRESHOLD_BYTES;
}

const fileSizeFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2
});

export function formatFileSize(bytes) {
  const units = ["t", "kt", "Mt", "Gt"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${fileSizeFormatter.format(value)} ${units[unitIndex]}`;
}

export function formatAspectRatio(aspectRatio) {
  return fileSizeFormatter.format(aspectRatio);
}

export function formatNumber(value) {
  return fileSizeFormatter.format(value);
}
