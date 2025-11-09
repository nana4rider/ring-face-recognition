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
import type * as ring from "ring-client-api";
import type { PushNotificationDingV2, RingCamera } from "ring-client-api";
import { PushNotificationAction } from "ring-client-api";
import type {
  FfmpegOptions,
  StreamingSession,
} from "ring-client-api/lib/streaming/streaming-session";
import { setTimeout } from "timers/promises";
import type { Writable } from "type-fest";

const writableEnv: Writable<typeof env> = env;

vi.mock("node:fs");

vi.mock("node:fs/promises");

vi.mock("@/service/face/detect", () => ({
  default: vi.fn(),
}));

vi.mock("@/service/face/recognize", () => ({
  default: vi.fn(),
}));

vi.mock("@/service/webhook", () => ({
  default: vi.fn(),
}));

vi.mock("@/util/imageUtil", () => ({
  composeImages: vi.fn(),
  isJpg: vi.fn(),
}));

const mockGetCameras = vi.fn();
const mockRefreshTokenSubscribe = vi.fn();

vi.mock("ring-client-api", async () => {
  const actual = await vi.importActual<typeof ring>("ring-client-api");

  return {
    ...actual,
    RingApi: class RingApi {
      onRefreshTokenUpdated = {
        subscribe: mockRefreshTokenSubscribe,
      };
      getCameras = mockGetCameras;
    },
  };
});

beforeEach(() => {
  writableEnv.RING_CAMERA_ID = undefined;
  writableEnv.RECOGNITION_FACE_COUNT = 1;
  vi.clearAllMocks();
});

function getMockCamera(id?: number): RingCamera {
  const mockOnNewNotification: Partial<RingCamera["onNewNotification"]> = {
    subscribe: vi.fn(),
  };
  const mockCamera: Partial<RingCamera> = {
    id,
    onNewNotification: mockOnNewNotification as RingCamera["onNewNotification"],
    streamVideo: vi.fn(),
  };

  return mockCamera as RingCamera;
}

function implementMockStreamVideo(
  mockCamera: RingCamera,
  mockImageBuffer = Buffer.alloc(0),
) {
  const mockStreamingSession: Partial<StreamingSession> = {
    stop: vi.fn(),
  };

  let executeStdoutCallback: () => void;
  vi.mocked(mockCamera.streamVideo).mockImplementation(
    async (options: FfmpegOptions) => {
      executeStdoutCallback = () => {
        setImmediate(() => {
          assert(options.stdoutCallback);
          options.stdoutCallback(mockImageBuffer);
        });
      };
      executeStdoutCallback();
      return Promise.resolve(mockStreamingSession as StreamingSession);
    },
  );

  return {
    ...mockStreamingSession,
    _executeCallback: () => executeStdoutCallback(),
  };
}

describe("initializeRingCamera", () => {
  test("カメラIDが設定されている場合、指定されたカメラを返す", async () => {
    writableEnv.RING_CAMERA_ID = 12345;

    const mockRefreshToken = "mockRefreshToken";
    const mockCamera = getMockCamera(12345);
    const mockFailedCamera = getMockCamera(12346);

    vi.mocked(readFile).mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([mockFailedCamera, mockCamera]);

    const result = await initializeRingCamera();

    expect(readFile).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/refreshToken/),
      "utf-8",
    );
    expect(mockGetCameras).toHaveBeenCalled();
    expect(result).toEqual(mockCamera);
  });

  test("カメラが見つからない場合、エラーをスローする", async () => {
    const mockRefreshToken = "mockRefreshToken";

    vi.mocked(readFile).mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([]);

    await expect(initializeRingCamera()).rejects.toThrow("Camera Not Found.");
  });

  test("リフレッシュトークンが変更された場合、トークンを更新する", async () => {
    const mockCamera = getMockCamera();
    const mockRefreshToken = "mockRefreshToken";
    const mockNewRefreshToken = "mockNewRefreshToken";

    vi.mocked(readFile).mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([mockCamera]);

    mockRefreshTokenSubscribe.mockImplementation(
      (callback: (data: { newRefreshToken: string }) => void) => {
        callback({
          newRefreshToken: mockNewRefreshToken,
        });
      },
    );

    await initializeRingCamera();

    expect(writeFileSync).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/refreshToken/),
      mockNewRefreshToken,
    );
  });
});

describe("setupCameraEventListeners", () => {
  test("Motionイベントで顔認識とWebhookがトリガーされる", async () => {
    const mockCamera = getMockCamera();
    setupCameraEventListeners(mockCamera);

    // simulate Motion notification
    const notification = {
      android_config: { category: PushNotificationAction.Motion },
    } as PushNotificationDingV2;
    const subscribeCallback = vi.mocked(mockCamera.onNewNotification?.subscribe)
      .mock.calls[0][0];
    assert(subscribeCallback);
    subscribeCallback(notification);

    await vi.waitFor(() => {
      expect(mockCamera.streamVideo).toHaveBeenCalledTimes(1);
      expect(triggerWebhook).toHaveBeenCalledExactlyOnceWith({
        type: "notification",
        event: "motion",
      });
    });
  });

  test("顔認識でエラーが発生しても例外がスローされない", () => {
    const mockCamera = getMockCamera();

    vi.mocked(mockCamera.streamVideo).mockRejectedValue(Error("test error"));

    setupCameraEventListeners(mockCamera);

    // simulate Motion notification
    const notification = {
      android_config: { category: PushNotificationAction.Motion },
    } as PushNotificationDingV2;
    const subscribeCallback = vi.mocked(mockCamera.onNewNotification?.subscribe)
      .mock.calls[0][0];
    assert(subscribeCallback);

    const actual = () => subscribeCallback(notification);
    expect(actual).not.toThrow();
  });

  test("DingイベントでWebhookがトリガーされる", () => {
    const mockCamera = getMockCamera();

    setupCameraEventListeners(mockCamera);

    const notification = {
      android_config: { category: PushNotificationAction.Ding },
    } as PushNotificationDingV2;
    const subscribeCallback = vi.mocked(mockCamera.onNewNotification?.subscribe)
      .mock.calls[0][0];
    assert(subscribeCallback);
    subscribeCallback(notification);

    expect(mockCamera.streamVideo).not.toHaveBeenCalled();
    expect(triggerWebhook).toHaveBeenCalledExactlyOnceWith({
      type: "notification",
      event: "ding",
    });
  });

  test("未知のイベントカテゴリーでは何もしない", () => {
    const mockCamera = getMockCamera();

    setupCameraEventListeners(mockCamera);

    // simulate an unknown notification
    const notification = {
      android_config: { category: "UnknownEvent" },
    } as PushNotificationDingV2;
    const subscribeCallback = vi.mocked(mockCamera.onNewNotification?.subscribe)
      .mock.calls[0][0];
    assert(subscribeCallback);
    subscribeCallback(notification);

    expect(mockCamera.streamVideo).not.toHaveBeenCalled();
    expect(triggerWebhook).not.toHaveBeenCalled();
  });

  test("subscribeが正しく呼び出される", () => {
    const mockCamera = getMockCamera();

    setupCameraEventListeners(mockCamera);

    expect(mockCamera.onNewNotification.subscribe).toHaveBeenCalledTimes(1);
    expect(
      mockCamera.onNewNotification.subscribe,
    ).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
  });
});

describe("startFaceRecognition", () => {
  test("顔認識できない場合、Webhookが呼ばれない", async () => {
    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    implementMockStreamVideo(mockCamera, mockImageBuffer);

    vi.mocked(isJpg).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");
    vi.mocked(detectFace).mockResolvedValue(mockFaceBuffer);
    vi.mocked(composeImages).mockResolvedValue(mockCompositeBuffer);
    vi.mocked(recognizeFace).mockResolvedValue(undefined);

    await startFaceRecognition(mockCamera);
    await setTimeout(50);

    expect(triggerWebhook).not.toHaveBeenCalled();
  });

  test("isJpgの条件が満たされないと顔検出しない", async () => {
    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    implementMockStreamVideo(mockCamera, mockImageBuffer);

    vi.mocked(isJpg).mockReturnValue(false);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");

    await startFaceRecognition(mockCamera);
    await setTimeout(50);

    expect(detectFace).not.toHaveBeenCalled();
  });

  test("検出した顔が必要数を満たしていない場合、画像合成が行われない", async () => {
    writableEnv.RECOGNITION_FACE_COUNT = 2;

    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    implementMockStreamVideo(mockCamera, mockImageBuffer);

    vi.mocked(isJpg).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");
    vi.mocked(detectFace).mockResolvedValue(mockFaceBuffer);

    await startFaceRecognition(mockCamera);
    await setTimeout(50);

    expect(composeImages).not.toHaveBeenCalled();
  });

  test("顔検出されなかった場合、画像合成が行われない", async () => {
    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    implementMockStreamVideo(mockCamera, mockImageBuffer);

    vi.mocked(isJpg).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");
    vi.mocked(detectFace).mockResolvedValue(undefined);

    await startFaceRecognition(mockCamera);
    await setTimeout(50);

    expect(composeImages).not.toHaveBeenCalled();
  });

  test("顔認識ができたらWebhookをトリガーする", async () => {
    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    const mockRecognizeFace = {
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: "testExternalImageId",
    };
    implementMockStreamVideo(mockCamera, mockImageBuffer);

    vi.mocked(isJpg).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");
    vi.mocked(detectFace).mockResolvedValue(mockFaceBuffer);
    vi.mocked(composeImages).mockResolvedValue(mockCompositeBuffer);
    vi.mocked(recognizeFace).mockResolvedValue(mockRecognizeFace);

    await startFaceRecognition(mockCamera);

    await vi.waitFor(() => {
      expect(detectFace).toHaveBeenCalledExactlyOnceWith(mockImageBuffer);
      expect(composeImages).toHaveBeenCalledExactlyOnceWith([mockFaceBuffer]);
      expect(recognizeFace).toHaveBeenCalledExactlyOnceWith(
        mockCompositeBuffer,
      );
      expect(triggerWebhook).toHaveBeenCalledExactlyOnceWith({
        type: "recognition",
        result: mockRecognizeFace,
      });
    });
  });

  test("顔認識でエラーが発生したらリトライする", async () => {
    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    const mockRecognizeFace = {
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: "testExternalImageId",
    };
    const mockStreamingSession = implementMockStreamVideo(
      mockCamera,
      mockImageBuffer,
    );

    vi.mocked(isJpg).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");
    vi.mocked(detectFace).mockResolvedValue(mockFaceBuffer);
    vi.mocked(composeImages).mockResolvedValue(mockCompositeBuffer);
    vi.mocked(recognizeFace)
      .mockImplementationOnce(() => {
        mockStreamingSession._executeCallback();
        return Promise.reject(new Error("recognition error"));
      })
      .mockResolvedValueOnce(mockRecognizeFace);

    await startFaceRecognition(mockCamera);

    await vi.waitFor(() => {
      expect(detectFace).toHaveBeenNthCalledWith(1, mockImageBuffer);
      expect(detectFace).toHaveBeenNthCalledWith(2, mockImageBuffer);
      expect(composeImages).toHaveBeenNthCalledWith(1, [mockFaceBuffer]);
      expect(composeImages).toHaveBeenNthCalledWith(2, [mockFaceBuffer]);
      expect(recognizeFace).toHaveBeenNthCalledWith(1, mockCompositeBuffer);
      expect(recognizeFace).toHaveBeenNthCalledWith(2, mockCompositeBuffer);
      expect(triggerWebhook).toHaveBeenCalledExactlyOnceWith({
        type: "recognition",
        result: mockRecognizeFace,
      });
    });
  });

  test("最大リトライ回数以上になるとストリームを停止する", async () => {
    const mockCamera = getMockCamera();
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");
    const mockStreamingSession = implementMockStreamVideo(
      mockCamera,
      mockImageBuffer,
    );

    vi.mocked(isJpg).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("mockRefreshToken");
    vi.mocked(detectFace).mockResolvedValue(mockFaceBuffer);
    vi.mocked(composeImages).mockResolvedValue(mockCompositeBuffer);
    vi.mocked(recognizeFace).mockImplementation(() => {
      mockStreamingSession._executeCallback();
      return Promise.reject(new Error("recognition error"));
    });

    await startFaceRecognition(mockCamera);

    await vi.waitFor(() => {
      expect(detectFace).toHaveBeenNthCalledWith(1, mockImageBuffer);
      expect(detectFace).toHaveBeenNthCalledWith(2, mockImageBuffer);
      expect(composeImages).toHaveBeenNthCalledWith(1, [mockFaceBuffer]);
      expect(composeImages).toHaveBeenNthCalledWith(2, [mockFaceBuffer]);
      expect(recognizeFace).toHaveBeenNthCalledWith(1, mockCompositeBuffer);
      expect(recognizeFace).toHaveBeenNthCalledWith(2, mockCompositeBuffer);
      expect(mockStreamingSession.stop).toHaveBeenCalled();
    });
  });

  test("タイムアウト時にストリームを停止する", async () => {
    vi.useFakeTimers();

    const mockCamera = getMockCamera();
    const mockStreamingSession = implementMockStreamVideo(mockCamera);

    await startFaceRecognition(mockCamera);

    vi.runAllTimers();
    vi.useRealTimers();

    await vi.waitFor(() => {
      expect(mockStreamingSession.stop).toHaveBeenCalled();
    });
  });
});
