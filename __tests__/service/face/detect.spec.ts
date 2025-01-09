import { jest } from "@jest/globals";

const mockFetchResponse = jest.fn<() => Response>();
global.fetch = jest
  .fn<typeof global.fetch>()
  .mockImplementation((_input: RequestInfo | URL, _init?: RequestInit) => {
    return Promise.resolve(mockFetchResponse());
  });

const mockBlobToBuffer = jest.fn();
const mockBufferToBlob = jest.fn();
jest.unstable_mockModule("@/util/dataTransformUtil", () => ({
  blobToBuffer: mockBlobToBuffer,
  bufferToBlob: mockBufferToBlob,
}));

describe("detectFace", () => {
  const env = process.env;
  const FACE_DETECTOR_API = "https://example.com/facedetector";
  const DETECT_MIN_SIZE = 80;
  const DETECT_CONFIDENCE = 0.9;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
    process.env.FACE_DETECTOR_API = FACE_DETECTOR_API;
    process.env.DETECT_MIN_SIZE = DETECT_MIN_SIZE.toString();
    process.env.DETECT_CONFIDENCE = DETECT_CONFIDENCE.toString();
  });

  test("API呼び出しが成功した場合、バッファを返す", async () => {
    const mockImageBuffer = Buffer.from("mockBuffer");
    const mockBlob = new Blob();
    const mockReturnedBuffer = Buffer.from("returnedBuffer");

    mockBufferToBlob.mockReturnValueOnce(mockBlob);
    mockFetchResponse.mockReturnValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as Response);
    mockBlobToBuffer.mockReturnValueOnce(mockReturnedBuffer);

    const { default: detectFace } = await import("@/service/face/detect");
    const result = await detectFace(mockImageBuffer);

    expect(mockBufferToBlob).toHaveBeenCalledWith(mockImageBuffer);
    expect(global.fetch).toHaveBeenCalledWith(
      `${FACE_DETECTOR_API}/detect`,
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData) as FormData,
      }),
    );
    expect(mockBlobToBuffer).toHaveBeenCalledWith(mockBlob);
    expect(result).toBe(mockReturnedBuffer);
  });

  test("API呼び出しが失敗した場合、undefinedを返す", async () => {
    const mockImageBuffer = Buffer.from("mockBuffer");
    const mockBlob = new Blob();
    const mockErrorResponse = { error: "Mock error" };

    mockBufferToBlob.mockReturnValueOnce(mockBlob);
    mockFetchResponse.mockReturnValueOnce({
      ok: false,
      json: () => Promise.resolve(mockErrorResponse),
    } as Response);

    const { default: detectFace } = await import("@/service/face/detect");
    const result = await detectFace(mockImageBuffer);

    expect(mockBufferToBlob).toHaveBeenCalledWith(mockImageBuffer);
    expect(global.fetch).toHaveBeenCalledWith(
      `${FACE_DETECTOR_API}/detect`,
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData) as FormData,
      }),
    );
    expect(result).toBeUndefined();
  });

  test("DETECT_MIN_SIZEとDETECT_CONFIDENCEがリクエストに反映される", async () => {
    process.env.DETECT_MIN_SIZE = "100";
    process.env.DETECT_CONFIDENCE = "0.8";

    const mockImageBuffer = Buffer.from("mockBuffer");
    const mockBlob = new Blob();

    mockBufferToBlob.mockReturnValueOnce(mockBlob);
    mockFetchResponse.mockReturnValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as Response);

    const { default: detectFace } = await import("@/service/face/detect");
    await detectFace(mockImageBuffer);

    const expectedFormData = new FormData();
    expectedFormData.append("minSize", "100");
    expectedFormData.append("confidence", "0.8");
    expectedFormData.append("file", mockBlob, "image.jpg");

    expect(global.fetch).toHaveBeenCalledWith(
      `${FACE_DETECTOR_API}/detect`,
      expect.objectContaining({
        method: "POST",
        body: expectedFormData,
      }),
    );
  });
});
