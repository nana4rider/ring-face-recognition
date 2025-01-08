import { Jimp } from "jimp";

export async function composeImages(imageBuffers: Buffer[]): Promise<Buffer> {
  if (imageBuffers.length === 0) {
    return Buffer.alloc(0);
  } else if (imageBuffers.length === 1) {
    return imageBuffers[0];
  }
  const images = await Promise.all(
    imageBuffers.map((buffer) => Jimp.read(buffer)),
  );

  const compositeHeight = images.reduce(
    (sum, img) => sum + img.bitmap.height,
    0,
  );
  const compositeWidth = Math.max(...images.map((img) => img.bitmap.width));
  const compositeImage = new Jimp({
    width: compositeWidth,
    height: compositeHeight,
  });

  let yOffset = 0;
  for (const img of images) {
    compositeImage.composite(img, 0, yOffset);
    yOffset += img.bitmap.height;
  }

  return compositeImage.getBuffer("image/jpeg");
}
