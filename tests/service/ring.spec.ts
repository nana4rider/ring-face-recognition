import env from "@/env";
import detectFace from "@/service/face/detect";
import recognizeFace from "@/service/face/recognize";
import {
  initializeRingCamera,
  setupCameraEventListeners,
  startFaceRecognition,
} from "@/service/ring";
import triggerWebhook from "@/service/webhook";
import { composeImages, isJpg } from "@/util/imageUtil";
import assert from "assert";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";
import {
  PushNotificationAction,
  PushNotificationDingV2,
  RingCamera,
  default as ring,
} from "ring-client-api";
import type {
  FfmpegOptions,
  StreamingSession,
} from "ring-client-api/lib/streaming/streaming-session";
import { setTimeout } from "timers/promises";
import { Writable } from "type-fest";
import { Mock } from "vitest";

vi.mock("node:fs");

vi.mock("node:fs/promises");

vi.mock("@/service/face/detect", () => ({
  __esModule: true,
  default: vi.fn(),
}));

vi.mock("@/service/face/recognize", () => ({
  __esModule: true,
  default: vi.fn(),
}));

vi.mock("@/service/webhook", () => ({
  __esModule: true,
  default: vi.fn(),
}));

vi.mock("@/util/imageUtil", () => ({
  composeImages: vi.fn(),
  isJpg: vi.fn(),
}));

const mockGetCameras = vi.fn();
const mockRefreshTokenSubscribe = vi.fn();
const mockStreamVideo = vi.fn().mockReturnValue({ stop: vi.fn() });

vi.mock("ring-client-api", async () => {
  const actual = await vi.importActual<typeof ring>("ring-client-api");

  return {
    ...actual,
    RingApi: vi.fn().mockImplementation(() => ({
      onRefreshTokenUpdated: {
        subscribe: mockRefreshTokenSubscribe,
      },
      getCameras: mockGetCameras,
    })),
  };
});

beforeEach(() => {
  (env as Writable<typeof env>).RING_CAMERA_ID = undefined;
  (env as Writable<typeof env>).RECOGNITION_FACE_COUNT = 1;
  vi.clearAllMocks();
});

describe("initializeRingCamera", () => {
  test("カメラIDが設定されている場合、指定されたカメラを返す", async () => {
    (env as Writable<typeof env>).RING_CAMERA_ID = 12345;

    const mockRefreshToken = "mockRefreshToken";
    const mockCamera = { id: 12345 } as RingCamera;
    const mockFailedCamera = { id: 12346 } as RingCamera;

    (readFile as Mock).mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([mockFailedCamera, mockCamera]);

    const result = await initializeRingCamera();

    expect(readFile).toHaveBeenCalledWith(
      expect.stringMatching(/refreshToken/),
      "utf-8",
    );
    expect(mockGetCameras).toHaveBeenCalled();
    expect(result).toEqual(mockCamera);
  });

  test("カメラが見つからない場合、エラーをスローする", async () => {
    const mockRefreshToken = "mockRefreshToken";

    (readFile as Mock).mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([]);

    await expect(initializeRingCamera()).rejects.toThrow("Camera Not Found.");
  });

  test("リフレッシュトークンが変更された場合、トークンを更新する", async () => {
    const mockCamera = { id: 12345 } as RingCamera;
    const mockRefreshToken = "mockRefreshToken";
    const mockNewRefreshToken = "mockNewRefreshToken";

    (readFile as Mock).mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([mockCamera]);

    mockRefreshTokenSubscribe.mockImplementation(
      (callback: (data: { newRefreshToken: string }) => void) => {
        callback({
          newRefreshToken: mockNewRefreshToken,
        });
      },
    );

    await initializeRingCamera();

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/refreshToken/),
      mockNewRefreshToken,
    );
  });
});

describe("setupCameraEventListeners", () => {
  test("Motionイベントで顔認識とWebhookがトリガーされる", async () => {
    const mockSubscribe =
      vi.fn<
        (callback: (notification: PushNotificationDingV2) => void) => void
      >();
    const mockCamera = {
      onNewNotification: { subscribe: mockSubscribe },
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;

    setupCameraEventListeners(mockCamera);

    // simulate Motion notification
    const notification = {
      android_config: { category: PushNotificationAction.Motion },
    } as PushNotificationDingV2;
    const subscribeCallback = mockSubscribe.mock.calls[0][0];
    subscribeCallback(notification);

    await vi.waitFor(() => {
      expect(mockStreamVideo).toHaveBeenCalledTimes(1);
      expect(triggerWebhook).toHaveBeenCalledWith({
        type: "notification",
        event: "motion",
      });
    });
  });

  test("顔認識でエラーが発生しても例外がスローされない", () => {
    const mockSubscribe =
      vi.fn<
        (callback: (notification: PushNotificationDingV2) => void) => void
      >();
    const mockCamera = {
      onNewNotification: { subscribe: mockSubscribe },
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;

    mockStreamVideo.mockRejectedValue(Error("test error"));

    setupCameraEventListeners(mockCamera);

    // simulate Motion notification
    const notification = {
      android_config: { category: PushNotificationAction.Motion },
    } as PushNotificationDingV2;
    const subscribeCallback = mockSubscribe.mock.calls[0][0];

    const actual = () => subscribeCallback(notification);
    expect(actual).not.toThrow();
  });

  test("DingイベントでWebhookがトリガーされる", () => {
    const mockSubscribe =
      vi.fn<
        (callback: (notification: PushNotificationDingV2) => void) => void
      >();
    const mockCamera = {
      onNewNotification: { subscribe: mockSubscribe },
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;

    setupCameraEventListeners(mockCamera);

    const notification = {
      android_config: { category: PushNotificationAction.Ding },
    } as PushNotificationDingV2;
    const subscribeCallback = mockSubscribe.mock.calls[0][0];
    subscribeCallback(notification);

    expect(mockStreamVideo).not.toHaveBeenCalled();
    expect(triggerWebhook).toHaveBeenCalledWith({
      type: "notification",
      event: "ding",
    });
  });

  test("未知のイベントカテゴリーでは何もしない", () => {
    const mockSubscribe =
      vi.fn<
        (callback: (notification: PushNotificationDingV2) => void) => void
      >();
    const mockCamera = {
      onNewNotification: { subscribe: mockSubscribe },
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;

    setupCameraEventListeners(mockCamera);

    // simulate an unknown notification
    const notification = {
      android_config: { category: "UnknownEvent" },
    } as PushNotificationDingV2;
    const subscribeCallback = mockSubscribe.mock.calls[0][0];
    subscribeCallback(notification);

    expect(mockStreamVideo).not.toHaveBeenCalled();
    expect(triggerWebhook).not.toHaveBeenCalled();
  });

  test("subscribeが正しく呼び出される", () => {
    const mockSubscribe = vi.fn();
    const mockCamera = {
      onNewNotification: { subscribe: mockSubscribe },
    } as unknown as RingCamera;

    setupCameraEventListeners(mockCamera);

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe("startFaceRecognition", () => {
  test("顔認識できない場合、Webhookが呼ばれない", async () => {
    (isJpg as Mock).mockReturnValue(true);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: vi.fn(),
      }) as unknown as Promise<StreamingSession>;
    });

    (detectFace as Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as Mock).mockResolvedValue(undefined);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(triggerWebhook).not.toHaveBeenCalled();
  });

  test("isJpgの条件が満たされないと顔検出しない", async () => {
    (isJpg as Mock).mockReturnValue(false);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: vi.fn(),
      }) as unknown as Promise<StreamingSession>;
    });

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(detectFace).not.toHaveBeenCalled();
  });

  test("検出した顔が必要数を満たしていない場合、画像合成が行われない", async () => {
    (env as Writable<typeof env>).RECOGNITION_FACE_COUNT = 2;

    (isJpg as Mock).mockReturnValue(true);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: vi.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as Mock).mockResolvedValue(mockFaceBuffer);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(composeImages).not.toHaveBeenCalled();
  });

  test("顔検出されなかった場合、画像合成が行われない", async () => {
    (isJpg as Mock).mockReturnValue(true);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: vi.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as Mock).mockResolvedValue(undefined);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(composeImages).not.toHaveBeenCalled();
  });

  test("顔認識ができたらWebhookをトリガーする", async () => {
    (isJpg as Mock).mockReturnValue(true);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    const mockRecognizeFace = {
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: "testExternalImageId",
    };

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: vi.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as Mock).mockResolvedValue(mockRecognizeFace);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(detectFace).toHaveBeenCalledWith(mockImageBuffer);
    expect(composeImages).toHaveBeenCalledWith([mockFaceBuffer]);
    expect(recognizeFace).toHaveBeenCalledWith(mockCompositeBuffer);
    expect(triggerWebhook).toHaveBeenCalledWith({
      type: "recognition",
      result: mockRecognizeFace,
    });
  });

  test("顔認識でエラーが発生したらリトライする", async () => {
    (isJpg as Mock).mockReturnValue(true);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    const mockRecognizeFace = {
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: "testExternalImageId",
    };

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    let executeStdoutCallback: () => void;
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      executeStdoutCallback = () => {
        setImmediate(() => {
          assert(options.stdoutCallback);
          options.stdoutCallback(mockImageBuffer);
        });
      };
      executeStdoutCallback();
      return Promise.resolve({
        stop: vi.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as Mock)
      .mockImplementationOnce(() => {
        executeStdoutCallback();
        return Promise.reject(new Error("recognition error"));
      })
      .mockResolvedValueOnce(mockRecognizeFace);

    await startFaceRecognition(mockCamera);
    await setTimeout(100);

    expect(detectFace).toHaveBeenCalledWith(mockImageBuffer);
    expect(composeImages).toHaveBeenCalledWith([mockFaceBuffer]);
    expect(recognizeFace).toHaveBeenNthCalledWith(1, mockCompositeBuffer);
    expect(recognizeFace).toHaveBeenNthCalledWith(2, mockCompositeBuffer);
    expect(triggerWebhook).toHaveBeenCalledWith({
      type: "recognition",
      result: mockRecognizeFace,
    });
  });

  test("最大リトライ回数以上になるとストリームを停止する", async () => {
    (isJpg as Mock).mockReturnValue(true);
    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");

    (readFile as Mock).mockResolvedValue("mockRefreshToken");

    let executeStdoutCallback: () => void;
    const stopMock = vi.fn();
    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      executeStdoutCallback = () => {
        setImmediate(() => {
          assert(options.stdoutCallback);
          options.stdoutCallback(mockImageBuffer);
        });
      };
      executeStdoutCallback();
      return Promise.resolve({
        stop: stopMock,
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as Mock).mockImplementation(() => {
      executeStdoutCallback();
      return Promise.reject(new Error("recognition error"));
    });

    await startFaceRecognition(mockCamera);
    await setTimeout(200);

    expect(detectFace).toHaveBeenCalledWith(mockImageBuffer);
    expect(composeImages).toHaveBeenCalledWith([mockFaceBuffer]);
    expect(recognizeFace).toHaveBeenNthCalledWith(1, mockCompositeBuffer);
    expect(recognizeFace).toHaveBeenNthCalledWith(2, mockCompositeBuffer);
    expect(stopMock).toHaveBeenCalled();
  });

  test("タイムアウト時にストリームを停止する", async () => {
    vi.useFakeTimers();

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;

    const stopMock = vi.fn();
    mockStreamVideo.mockReturnValue(
      Promise.resolve({
        stop: stopMock,
      }) as unknown as Promise<StreamingSession>,
    );

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    vi.runAllTimers();

    expect(stopMock).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
