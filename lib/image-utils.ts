/**
 * Converts an image file to WebP format.
 * @param file The input image file.
 * @param quality The quality of the WebP image (0 to 1). Default is 0.8.
 * @returns A Promise that resolves to the converted File object.
 */
export const convertImageToWebP = (
  file: File,
  quality = 0.8
): Promise<File> => {
  return new Promise((resolve, reject) => {
    // If it's already WebP or GIF, return as is
    if (file.type === "image/webp" || file.type === "image/gif") {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const newFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, "") + ".webp",
              {
                type: "image/webp",
                lastModified: Date.now(),
              }
            );
            resolve(newFile);
          } else {
            reject(new Error("Conversion to WebP failed"));
          }
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Error loading image"));
    };

    img.src = url;
  });
};
