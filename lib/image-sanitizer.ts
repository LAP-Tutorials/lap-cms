import { ref, uploadBytes, getDownloadURL, deleteObject, type FirebaseStorage } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
];

export const MAX_RAW_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB initial ceiling (generous for raw iPhone HEIC)
export const MAX_IMAGE_DIMENSION = 1600; // max width/height in px
export const COMPRESSION_QUALITY = 0.85;

export interface SanitizedImageResult {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  contentType: "image/webp" | "image/jpeg";
  fileName: string;
}

/**
 * Strips all EXIF metadata, SVG/XSS vectors, and binary polyglot payloads by
 * decoding the raster image in memory (converting HEIC if needed),
 * drawing it onto a fresh 2D canvas, resizing if necessary,
 * and re-exporting strictly as a clean WebP or JPEG binary.
 */
export async function sanitizeAndCompressImage(
  file: File | Blob,
  fallbackName = "attachment",
): Promise<SanitizedImageResult> {
  const type = (file.type || "").toLowerCase();
  const isHeic =
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence" ||
    (file instanceof File && /\.(heic|heif)$/i.test(file.name));

  // Strictly block SVG and non-whitelisted image types
  if (!isHeic && !ALLOWED_IMAGE_TYPES.includes(type)) {
    throw new Error(
      "Unsupported file format. Please upload a standard image (JPEG, PNG, WebP, GIF, AVIF, HEIC).",
    );
  }

  if (type === "image/svg+xml") {
    throw new Error("SVG vector images are not allowed for security reasons.");
  }

  if (file.size > MAX_RAW_IMAGE_SIZE) {
    throw new Error("The image file is too large (maximum 25MB before compression).");
  }

  let processableBlob: Blob = file;

  if (isHeic) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9,
      });
      processableBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch (heicErr) {
      console.warn("HEIC conversion fallback:", heicErr);
    }
  }

  const rawObjectUrl = URL.createObjectURL(processableBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error("Could not decode image. The file may be corrupt or invalid."),
        );
      image.src = rawObjectUrl;
    });

    let { naturalWidth: width, naturalHeight: height } = img;

    if (width <= 0 || height <= 0) {
      throw new Error("Invalid image dimensions.");
    }

    // Scale down dimensions if exceeding ceiling
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      if (width > height) {
        height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
        width = MAX_IMAGE_DIMENSION;
      } else {
        width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
        height = MAX_IMAGE_DIMENSION;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }

    // Draw the raster pixels cleanly onto the blank canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Try exporting as WebP first, fallback to JPEG
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", COMPRESSION_QUALITY);
    }).then(async (webpBlob) => {
      if (webpBlob && webpBlob.size > 0) return webpBlob;
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      });
    });

    if (!blob) {
      throw new Error("Failed to export clean sanitized image binary.");
    }

    const isWebp = blob.type === "image/webp";
    const contentType: "image/webp" | "image/jpeg" = isWebp
      ? "image/webp"
      : "image/jpeg";
    const ext = isWebp ? "webp" : "jpg";

    const baseName =
      file instanceof File
        ? file.name.replace(/\.[^/.]+$/, "")
        : fallbackName;
    const cleanFileName = `${baseName}.${ext}`;

    const previewUrl = URL.createObjectURL(blob);

    return {
      blob,
      previewUrl,
      width,
      height,
      sizeBytes: blob.size,
      contentType,
      fileName: cleanFileName,
    };
  } finally {
    URL.revokeObjectURL(rawObjectUrl);
  }
}

export interface CommentImageAttachment {
  url: string;
  storagePath: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * Uploads a sanitized image blob to Firebase Storage in the user's comments partition.
 */
export async function uploadSanitizedCommentImage(
  storageInstance: FirebaseStorage,
  _userId: string,
  sanitized: SanitizedImageResult,
  reservedStoragePath: string,
): Promise<{ imageUrl: string; imageStoragePath: string }> {
  const imageStoragePath = reservedStoragePath;

  const storageRef = ref(storageInstance, imageStoragePath);
  await uploadBytes(storageRef, sanitized.blob, {
    contentType: sanitized.contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });

  const imageUrl = await getDownloadURL(storageRef);

  return {
    imageUrl,
    imageStoragePath,
  };
}

/**
 * Uploads multiple sanitized images and removes any partial upload on failure.
 */
export async function uploadMultipleSanitizedImages(
  storageInstance: FirebaseStorage,
  userId: string,
  sanitizedImages: SanitizedImageResult[],
): Promise<CommentImageAttachment[]> {
  const results: CommentImageAttachment[] = [];
  try {
    const reserveUploads = httpsCallable<
      { extensions: string[] },
      { storagePaths: string[] }
    >(functions, "reserveCommentUploads");
    const reservation = await reserveUploads({
      extensions: sanitizedImages.map((image) =>
        image.contentType === "image/webp" ? "webp" : "jpg"
      ),
    });
    if (reservation.data.storagePaths.length !== sanitizedImages.length) {
      throw new Error("The server returned an invalid upload reservation.");
    }
    for (let index = 0; index < sanitizedImages.length; index += 1) {
      const sanitized = sanitizedImages[index];
      const { imageUrl, imageStoragePath } = await uploadSanitizedCommentImage(
        storageInstance,
        userId,
        sanitized,
        reservation.data.storagePaths[index],
      );
      results.push({
        url: imageUrl,
        storagePath: imageStoragePath,
        width: sanitized.width,
        height: sanitized.height,
        alt: sanitized.fileName,
      });
    }
    return results;
  } catch (error) {
    await deleteMultipleCommentImagesSafe(storageInstance, results);
    throw error;
  }
}

/**
 * Safely cleans up an attached image from Firebase Storage if it exists.
 */
export async function deleteCommentImageSafe(
  storageInstance: FirebaseStorage,
  imageStoragePath?: string,
): Promise<void> {
  if (!imageStoragePath) return;
  try {
    const storageRef = ref(storageInstance, imageStoragePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Storage file cleanup non-fatal warning:", err);
  }
}

/**
 * Safely cleans up multiple attached images from Firebase Storage.
 */
export async function deleteMultipleCommentImagesSafe(
  storageInstance: FirebaseStorage,
  imagesOrPaths?: (string | undefined | CommentImageAttachment)[],
): Promise<void> {
  if (!imagesOrPaths || imagesOrPaths.length === 0) return;
  const paths: string[] = imagesOrPaths
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      return item.storagePath || "";
    })
    .filter(Boolean);

  await Promise.all(
    paths.map((path) => deleteCommentImageSafe(storageInstance, path)),
  );
}
