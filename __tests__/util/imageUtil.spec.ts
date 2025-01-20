import { composeImages, isJpg } from "@/util/imageUtil";
import { unlink, writeFile } from "fs/promises";
import gm from "gm";
import { tmpdir } from "os";

jest.mock("fs/promises", () => ({
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock("gm", () =>
  jest.fn(() => ({
    in: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    toBuffer: jest.fn(
      (_, callback: (err: Error | null, buffer: Buffer) => void) =>
        callback(null, Buffer.from("test-buffer")),
    ),
  })),
);

describe("composeImages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("空の画像リストを渡すと空のバッファを返す", async () => {
    const result = await composeImages([]);
    expect(result).toEqual(Buffer.alloc(0));
  });

  test("1つの画像バッファを渡すとそのまま返す", async () => {
    const buffer = Buffer.from("single-image");
    const result = await composeImages([buffer]);
    expect(result).toEqual(buffer);
  });

  test("複数の画像バッファを結合して返す", async () => {
    const buffers = [Buffer.from("image1"), Buffer.from("image2")];

    (writeFile as jest.Mock).mockImplementation(async () => {
      // シミュレーション用の書き込みモック
    });

    (unlink as jest.Mock).mockImplementation(async () => {
      // シミュレーション用の削除モック
    });

    const result = await composeImages(buffers);

    // writeFile が適切に呼ばれたことを確認
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(tmpdir()),
      buffers[0],
    );
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(tmpdir()),
      buffers[1],
    );

    // GraphicsMagick が呼ばれたことを確認
    const gmMock = gm as unknown as jest.Mock;
    expect(gmMock).toHaveBeenCalledWith(expect.stringContaining(tmpdir()));

    // 結合後のバッファが返されることを確認
    expect(result).toEqual(Buffer.from("test-buffer"));

    // unlink が適切に呼ばれたことを確認
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining(tmpdir()));
  });

  test("GraphicsMagick のエラーを適切に処理する", async () => {
    const buffers = [Buffer.from("image1"), Buffer.from("image2")];

    (writeFile as jest.Mock).mockImplementation(() => {
      // シミュレーション用の書き込みモック
    });

    (unlink as jest.Mock).mockImplementation(() => {
      // シミュレーション用の削除モック
    });

    const error = new Error("GM Error");
    (gm as unknown as jest.Mock).mockImplementationOnce(() => ({
      in: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      toBuffer: jest.fn(
        (_, callback: (err: Error | null, buffer: Buffer) => void) =>
          callback(error, Buffer.alloc(0)),
      ),
    }));

    await expect(composeImages(buffers)).rejects.toThrow("GM Error");

    // unlink が適切に呼ばれたことを確認
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining(tmpdir()));
  });
});

describe("isJpg", () => {
  test("JPG 画像を正しく識別する", () => {
    const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(isJpg(jpgBuffer)).toBe(true);
  });

  test("非 JPG 画像を正しく識別する", () => {
    const nonJpgBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(isJpg(nonJpgBuffer)).toBe(false);
  });
});