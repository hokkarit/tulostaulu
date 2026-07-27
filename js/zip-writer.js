function buildCrcTable() {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[i] = c >>> 0;
  }

  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | (date.getDate() & 0x1f);

  return { dosTime, dosDate };
}

async function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return new Uint8Array(await data.arrayBuffer());
}

// Kevyt ZIP-kirjoitin ilman ulkoisia riippuvuuksia. Tiedostot tallennetaan
// pakkaamattomina (menetelmä "store"), koska konfiguraation sisältö on jo
// pääosin pakattua kuva-/videodataa eikä pakkauksesta olisi juuri hyötyä.
export async function createZipBlob(entries, { onProgress } = {}) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralRecords = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosDateTime(new Date());

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.(i + 1, entries.length, entry.path);

    const nameBytes = encoder.encode(entry.path);
    const fileBytes = await toUint8Array(entry.data);
    const crc = crc32(fileBytes);

    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true);
    localHeader.setUint16(6, 0, true);
    localHeader.setUint16(8, 0, true);
    localHeader.setUint16(10, dosTime, true);
    localHeader.setUint16(12, dosDate, true);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, fileBytes.length, true);
    localHeader.setUint32(22, fileBytes.length, true);
    localHeader.setUint16(26, nameBytes.length, true);
    localHeader.setUint16(28, 0, true);

    chunks.push(new Uint8Array(localHeader.buffer), nameBytes, fileBytes);

    centralRecords.push({ nameBytes, crc, size: fileBytes.length, offset });
    offset += 30 + nameBytes.length + fileBytes.length;
  }

  const centralDirStart = offset;
  let centralDirSize = 0;

  for (const record of centralRecords) {
    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, 20, true);
    centralHeader.setUint16(6, 20, true);
    centralHeader.setUint16(8, 0, true);
    centralHeader.setUint16(10, 0, true);
    centralHeader.setUint16(12, dosTime, true);
    centralHeader.setUint16(14, dosDate, true);
    centralHeader.setUint32(16, record.crc, true);
    centralHeader.setUint32(20, record.size, true);
    centralHeader.setUint32(24, record.size, true);
    centralHeader.setUint16(28, record.nameBytes.length, true);
    centralHeader.setUint16(30, 0, true);
    centralHeader.setUint16(32, 0, true);
    centralHeader.setUint16(34, 0, true);
    centralHeader.setUint16(36, 0, true);
    centralHeader.setUint32(38, 0, true);
    centralHeader.setUint32(42, record.offset, true);

    chunks.push(new Uint8Array(centralHeader.buffer), record.nameBytes);
    centralDirSize += 46 + record.nameBytes.length;
  }

  const endRecord = new DataView(new ArrayBuffer(22));
  endRecord.setUint32(0, 0x06054b50, true);
  endRecord.setUint16(4, 0, true);
  endRecord.setUint16(6, 0, true);
  endRecord.setUint16(8, centralRecords.length, true);
  endRecord.setUint16(10, centralRecords.length, true);
  endRecord.setUint32(12, centralDirSize, true);
  endRecord.setUint32(16, centralDirStart, true);
  endRecord.setUint16(20, 0, true);

  chunks.push(new Uint8Array(endRecord.buffer));

  return new Blob(chunks, { type: "application/zip" });
}
