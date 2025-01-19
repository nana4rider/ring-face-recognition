import env from "@/env";
import detectFace from "@/service/face/detect";
import { bufferToBlob } from "@/util/dataTransformUtil";
import { MutableEnv } from "jest.setup";

const mockFetchResponse = jest.fn();
global.fetch = jest
  .fn()
  .mockImplementation((_input: RequestInfo | URL, _init?: RequestInit) => {
    return Promise.resolve(mockFetchResponse());
  });

describe("detectFace", () => {
  test("API呼び出しが成功した場合、バッファを返す", async () => {
    mockFetchResponse.mockReturnValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["responseData"])),
    } as Response);
    const result = await detectFace(Buffer.from("requestData"));

    expect(global.fetch).toHaveBeenCalledWith(
      `${process.env.FACE_DETECTOR_API}/detect`,
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData) as FormData,
      }),
    );
    expect(result).toEqual(Buffer.from("responseData"));
  });

  test("API呼び出しが失敗した場合、undefinedを返す", async () => {
    mockFetchResponse.mockReturnValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Mock error" }),
    } as Response);

    const result = await detectFace(Buffer.from("requestData"));

    expect(global.fetch).toHaveBeenCalledWith(
      `${process.env.FACE_DETECTOR_API}/detect`,
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData) as FormData,
      }),
    );
    expect(result).toBeUndefined();
  });

  test("オプションがリクエストに反映される", async () => {
    (env as MutableEnv).DETECT_MIN_SIZE = 100;
    (env as MutableEnv).DETECT_START_X = 200;
    (env as MutableEnv).DETECT_START_Y = 300;
    (env as MutableEnv).DETECT_END_X = 400;
    (env as MutableEnv).DETECT_END_Y = 500;

    const requestData = Buffer.from("requestData");

    mockFetchResponse.mockReturnValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["responseData"])),
    } as Response);

    await detectFace(requestData);

    const expectedFormData = new FormData();
    expectedFormData.append("minSize", "100");
    expectedFormData.append("startX", "200");
    expectedFormData.append("startY", "300");
    expectedFormData.append("endX", "400");
    expectedFormData.append("endY", "500");
    expectedFormData.append("file", bufferToBlob(requestData), "image.jpg");

    expect(global.fetch).toHaveBeenCalledWith(
      `${process.env.FACE_DETECTOR_API}/detect`,
      expect.objectContaining({
        method: "POST",
        body: expectedFormData,
      }),
    );
  });
});
