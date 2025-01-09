import { jest } from "@jest/globals";
import assert from "assert";
import { RingApi, RingCamera } from "ring-client-api";
import {
  FfmpegOptions,
  StreamingSession,
} from "ring-client-api/lib/streaming/streaming-session";
import { setTimeout } from "timers/promises";

const mockReadFile = jest.fn();
const mockWriteFileSync = jest.fn();
const mockWriteFile = jest.fn();
const mockRm = jest.fn();
const mockGlob = jest.fn();
const mockDetectFace = jest.fn();
const mockRecognizeFace = jest.fn();
const mockTriggerWebhook = jest.fn();
const mockComposeImages = jest.fn();
const mockStreamVideo = jest.fn<RingCamera["streamVideo"]>();
const mockRefreshTokenSubscribe =
  jest.fn<RingApi["onRefreshTokenUpdated"]["subscribe"]>();
const mockGetCameras = jest.fn();

jest.unstable_mockModule("fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  rm: mockRm,
}));

jest.unstable_mockModule("fs", () => ({
  writeFileSync: mockWriteFileSync,
}));

jest.unstable_mockModule("glob", () => ({
  glob: mockGlob,
}));

jest.unstable_mockModule("@/service/face/detect", () => ({
  default: mockDetectFace,
}));

jest.unstable_mockModule("@/service/face/recognize", () => ({
  default: mockRecognizeFace,
}));

jest.unstable_mockModule("@/service/webhook", () => ({
  default: mockTriggerWebhook,
}));

jest.unstable_mockModule("@/util/imageUtil", () => ({
  composeImages: mockComposeImages,
}));

jest.unstable_mockModule("ring-client-api", () => ({
  RingApi: jest.fn().mockImplementation(() => ({
    getCameras: mockGetCameras,
    onRefreshTokenUpdated: { subscribe: mockRefreshTokenSubscribe },
  })),
}));

describe("initializeRingCamera", () => {
  test("カメラIDが設定されている場合、指定されたカメラを返す", async () => {
    const mockRefreshToken = "mockRefreshToken";
    const mockCamera = { id: 12345 };

    mockReadFile.mockReturnValue(Promise.resolve(mockRefreshToken));
    mockGetCameras.mockReturnValue(Promise.resolve([mockCamera]));

    process.env.RING_CAMERA_ID = "12345";

    const { initializeRingCamera } = await import("@/service/ring");
    const result = await initializeRingCamera();

    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringMatching(/refreshToken/),
      "utf-8",
    );
    expect(mockGetCameras).toHaveBeenCalled();
    expect(result).toEqual(mockCamera);
  });

  test("カメラが見つからない場合、エラーをスローする", async () => {
    const mockRefreshToken = "mockRefreshToken";

    mockReadFile.mockReturnValue(Promise.resolve(mockRefreshToken));
    mockGetCameras.mockReturnValue(Promise.resolve([]));

    const { initializeRingCamera } = await import("@/service/ring");

    await expect(initializeRingCamera()).rejects.toThrow("Camera Not Found.");
  });

  test("リフレッシュトークンが変更された場合、トークンを更新する", async () => {
    const mockNewRefreshToken = "mockNewRefreshToken";

    mockGetCameras.mockReturnValue(Promise.resolve([{ id: 12345 }]));
    mockRefreshTokenSubscribe.mockImplementation((callback) => {
      assert(typeof callback === "function");
      callback({
        newRefreshToken: mockNewRefreshToken,
      });
      return {} as ReturnType<RingApi["onRefreshTokenUpdated"]["subscribe"]>;
    });

    const { initializeRingCamera } = await import("@/service/ring");
    await initializeRingCamera();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/refreshToken/),
      mockNewRefreshToken,
    );
  });
});

describe("startFaceRecognition", () => {
  test("顔認識できない場合、Webhookが呼ばれない", async () => {
    process.env.SKIP_IMAGE_BUFFER_COUNT = "0";
    process.env.REKOGNITION_FACE_COUNT = "1";

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");

    mockReadFile.mockReturnValue(Promise.resolve("mockRefreshToken"));
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    mockDetectFace.mockReturnValue(Promise.resolve(mockFaceBuffer));
    mockComposeImages.mockReturnValue(Promise.resolve(mockCompositeBuffer));
    mockRecognizeFace.mockReturnValue(Promise.resolve(undefined));

    const { startFaceRecognition } = await import("@/service/ring");
    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(mockTriggerWebhook).not.toHaveBeenCalled();
  });

  test("SKIP_IMAGE_BUFFER_COUNTの条件が満たされるまで顔検出しない", async () => {
    process.env.SKIP_IMAGE_BUFFER_COUNT = "1";
    process.env.REKOGNITION_FACE_COUNT = "1";

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");

    mockReadFile.mockReturnValue(Promise.resolve("mockRefreshToken"));
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });

    const { startFaceRecognition } = await import("@/service/ring");
    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(mockDetectFace).not.toHaveBeenCalled();
  });

  test("検出した顔が必要数を満たしていない場合、画像合成が行われない", async () => {
    process.env.SKIP_IMAGE_BUFFER_COUNT = "0";
    process.env.REKOGNITION_FACE_COUNT = "2";

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");

    mockReadFile.mockReturnValue(Promise.resolve("mockRefreshToken"));
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    mockDetectFace.mockReturnValue(Promise.resolve(mockFaceBuffer));

    const { startFaceRecognition } = await import("@/service/ring");
    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(mockComposeImages).not.toHaveBeenCalled();
  });

  test("顔検出されなかった場合、画像合成が行われない", async () => {
    process.env.SKIP_IMAGE_BUFFER_COUNT = "0";
    process.env.REKOGNITION_FACE_COUNT = "1";

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");

    mockReadFile.mockReturnValue(Promise.resolve("mockRefreshToken"));
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    mockDetectFace.mockReturnValue(Promise.resolve(undefined));

    const { startFaceRecognition } = await import("@/service/ring");
    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(mockComposeImages).not.toHaveBeenCalled();
  });
  const env = process.env;
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
  });

  test("顔認識ができたらWebhookをトリガーする", async () => {
    process.env.SKIP_IMAGE_BUFFER_COUNT = "0";
    process.env.REKOGNITION_FACE_COUNT = "1";

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    const mockFace = {
      FaceId: "mockFaceId",
      ExternalImageId: "mockImageId",
    };

    mockReadFile.mockReturnValue(Promise.resolve("mockRefreshToken"));
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    mockDetectFace.mockReturnValue(Promise.resolve(mockFaceBuffer));
    mockComposeImages.mockReturnValue(Promise.resolve(mockCompositeBuffer));
    mockRecognizeFace.mockReturnValue(Promise.resolve(mockFace));

    const { startFaceRecognition } = await import("@/service/ring");
    await startFaceRecognition(mockCamera);
    await setTimeout(10);
    expect(mockDetectFace).toHaveBeenCalledWith(mockImageBuffer);
    expect(mockComposeImages).toHaveBeenCalledWith([mockFaceBuffer]);
    expect(mockRecognizeFace).toHaveBeenCalledWith(mockCompositeBuffer);
    expect(mockTriggerWebhook).toHaveBeenCalledWith({
      type: "rekognition",
      result: {
        faceId: "mockFaceId",
        imageId: "mockImageId",
      },
    });
  });

  test("タイムアウト時にストリームを停止する", async () => {
    jest.useFakeTimers();

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;

    const stopMock = jest.fn();
    mockStreamVideo.mockReturnValue(
      Promise.resolve({
        stop: stopMock,
      }) as unknown as Promise<StreamingSession>,
    );

    const { startFaceRecognition } = await import("@/service/ring");
    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    jest.runAllTimers();

    expect(stopMock).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
