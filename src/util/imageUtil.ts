import { unlink, writeFile } from "fs/promises";
import gm from "gm";
import { tmpdir } from "os";
import { join } from "path";

export async function composeImages(imageBuffers: Buffer[]): Promise<Buffer> {
  if (imageBuffers.length === 0) {
    return Buffer.alloc(0);
  } else if (imageBuffers.length === 1) {
    return imageBuffers[0];
  }

  // 一時ファイルを作成するヘルパー関数（非同期）
  const createTempFile = async (buffer: Buffer): Promise<string> => {
    const tempFilePath = join(
      tmpdir(),
      `temp-${Date.now()}-${Math.random()}.png`,
    );
    await writeFile(tempFilePath, buffer); // 非同期で書き込み
    return tempFilePath;
  };

  // 全ての画像を一時ファイルとして保存
  const tempFiles = await Promise.all(imageBuffers.map(createTempFile));

  try {
    // GraphicsMagickで画像を結合
    const compositeBuffer = await new Promise<Buffer>((resolve, reject) => {
      const composite = gm(tempFiles[0]);

      // 他の画像を順次追加
      tempFiles.slice(1).forEach((filePath) => composite.in(filePath));

      // append(true) で縦に画像を結合
      composite.append(true).toBuffer("JPEG", (err, buffer) => {
        if (err) reject(err);
        else resolve(buffer);
      });
    });

    return compositeBuffer;
  } finally {
    // 一時ファイルを非同期で削除
    await Promise.all(tempFiles.map((file) => unlink(file)));
  }
}
