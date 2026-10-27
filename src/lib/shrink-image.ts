// Memperkecil foto di browser sebelum diunggah, supaya website tetap ringan dibuka di HP.
// Foto biasa menjadi JPEG; logo (keepAlpha) menjadi WEBP agar latar transparan tetap terjaga.
// Bila browser tidak mendukung atau hasilnya justru lebih besar, file asli yang dipakai.
export async function shrinkImage(file: File, maxSide = 1600, keepAlpha = false): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 400_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = keepAlpha ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob || blob.size >= file.size || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) return file;
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + `.${ext}`, { type: blob.type });
}
