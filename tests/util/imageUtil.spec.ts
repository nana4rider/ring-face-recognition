import { composeImages, isJpg } from "@/util/imageUtil";
import { unlink, writeFile } from "fs/promises";
import gm from "gm";
import { tmpdir } from "os";

vi.mock("node:fs/promises");

vi.mock("gm", () => ({
  default: vi.fn(() => ({
    in: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(
      (
        _format: string,
        callback: (err: Error | null, buffer: Buffer) => void,
      ) => callback(null, Buffer.from("test-buffer")),
    ),
  })),
}));

describe("composeImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const result = await composeImages(buffers);

    // writeFile が適切に呼ばれたことを確認
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(tmpdir()),
      buffers[0],
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(tmpdir()),
      buffers[1],
    );

    // GraphicsMagick が呼ばれたことを確認
    expect(gm).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(tmpdir()),
    );

    // 結合後のバッファが返されることを確認
    expect(result).toEqual(Buffer.from("test-buffer"));

    // unlink が適切に呼ばれたことを確認
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(tmpdir()),
    );
    expect(unlink).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(tmpdir()),
    );
  });

  test("GraphicsMagick のエラーを適切に処理する", async () => {
    const buffers = [Buffer.from("image1"), Buffer.from("image2")];

    const mockGmReturnValue: Partial<ReturnType<typeof gm>> = {
      in: vi.fn().mockReturnThis(),
      append: vi.fn().mockReturnThis(),
      toBuffer: vi
        .fn()
        .mockImplementation(
          (
            _format: string,
            callback: (err: Error | null, buffer: Buffer) => void,
          ) => callback(new Error("GM Error"), Buffer.alloc(0)),
        ),
    };
    vi.mocked(gm).mockImplementationOnce(
      () => mockGmReturnValue as ReturnType<typeof gm>,
    );

    await expect(composeImages(buffers)).rejects.toThrow("GM Error");

    // unlink が適切に呼ばれたことを確認
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(tmpdir()),
    );
    expect(unlink).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(tmpdir()),
    );
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
