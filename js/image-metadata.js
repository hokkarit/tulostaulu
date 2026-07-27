export async function readImageDimensions(file) {
  try {
    return await readImageDimensionsWithBitmap(file);
  } catch {
    return await readImageDimensionsWithImageElement(file);
  }
}

async function readImageDimensionsWithBitmap(file) {
  const bitmap = await createImageBitmap(file);

  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
      aspectRatio: bitmap.width / bitmap.height
    };
  } finally {
    bitmap.close();
  }
}

function readImageDimensionsWithImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(objectUrl);
      resolve({
        width,
        height,
        aspectRatio: width / height
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Kuvan lataaminen epäonnistui."));
    };

    image.src = objectUrl;
  });
}
