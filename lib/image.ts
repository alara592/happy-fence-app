"use client";

/**
 * Downscale a captured photo to ~maxPx on its longest side and return a JPEG data URL.
 * Runs invisibly between "take photo" and "upload" — a 4 MB phone shot becomes ~300 KB,
 * so storage/egress stay cheap and uploads are fast on cell signal. EXIF orientation is
 * baked in (imageOrientation: "from-image") so portrait photos don't upload sideways.
 */
export async function compressImage(
  file: File,
  maxPx = 1600,
  quality = 0.75,
): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing unavailable on this device");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", quality);
}
