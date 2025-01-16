import env from "@/env";
import detectFace from "@/service/face/detect";
import recognizeFace from "@/service/face/recognize";
import {
  initializeRingCamera,
  setupCameraEventListeners,
  startFaceRecognition,
} from "@/service/ring";
import triggerWebhook from "@/service/webhook";
import { composeImages } from "@/util/imageUtil";
import assert from "assert";
import fsLegacy from "fs";
import fs from "fs/promises";
import { MutableEnv } from "jest.setup";
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

jest.mock("fs/promises", () => {
  return {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  };
});

jest.mock("@/service/face/detect", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/service/face/recognize", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/service/webhook", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/util/imageUtil", () => ({
  composeImages: jest.fn(),
}));

const mockGetCameras = jest.fn();
const mockRefreshTokenSubscribe = jest.fn();
const mockStreamVideo = jest.fn().mockReturnValue({ stop: jest.fn() });

jest.mock("ring-client-api", () => {
  const actual = jest.requireActual<typeof ring>("ring-client-api");

  return {
    ...actual,
    RingApi: jest.fn().mockImplementation(() => ({
      onRefreshTokenUpdated: {
        subscribe: mockRefreshTokenSubscribe,
      },
      getCameras: mockGetCameras,
    })),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("initializeRingCamera", () => {
  test("カメラIDが設定されている場合、指定されたカメラを返す", async () => {
    (env as MutableEnv).RING_CAMERA_ID = 12345;

    const mockRefreshToken = "mockRefreshToken";
    const mockCamera = { id: 12345 } as RingCamera;
    const mockFailedCamera = { id: 12346 } as RingCamera;

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([mockFailedCamera, mockCamera]);

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

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([]);

    await expect(initializeRingCamera()).rejects.toThrow("Camera Not Found.");
  });

  test("リフレッシュトークンが変更された場合、トークンを更新する", async () => {
    const mockCamera = { id: 12345 } as RingCamera;
    const mockRefreshToken = "mockRefreshToken";
    const mockNewRefreshToken = "mockNewRefreshToken";

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue(mockRefreshToken);

    mockGetCameras.mockResolvedValue([mockCamera]);

    mockRefreshTokenSubscribe.mockImplementation(
      (callback: (data: { newRefreshToken: string }) => void) => {
        callback({
          newRefreshToken: mockNewRefreshToken,
        });
      },
    );

    const mockWriteFileSync = jest.spyOn(fsLegacy, "writeFileSync");

    await initializeRingCamera();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/refreshToken/),
      mockNewRefreshToken,
    );
  });
});

describe("setupCameraEventListeners", () => {
  test("Motionイベントで顔認識とWebhookがトリガーされる", () => {
    const mockSubscribe = jest.fn<
      void,
      [(notification: PushNotificationDingV2) => void]
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

    expect(mockStreamVideo).toHaveBeenCalledTimes(1);
    expect(triggerWebhook).toHaveBeenCalledWith({
      type: "notification",
      event: "motion",
    });
  });

  test("顔認識でエラーが発生しても例外がスローされない", () => {
    const mockSubscribe = jest.fn<
      void,
      [(notification: PushNotificationDingV2) => void]
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
    const mockSubscribe = jest.fn<
      void,
      [(notification: PushNotificationDingV2) => void]
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
    const mockSubscribe = jest.fn<
      void,
      [(notification: PushNotificationDingV2) => void]
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
    const mockSubscribe = jest.fn();
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
    (env as MutableEnv).SKIP_IMAGE_BUFFER_COUNT = 0;
    (env as MutableEnv).REKOGNITION_FACE_COUNT = 1;

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");
    const mockCompositeBuffer = Buffer.from("mockCompositeBuffer");

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });

    (detectFace as jest.Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as jest.Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as jest.Mock).mockResolvedValue(undefined);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(triggerWebhook).not.toHaveBeenCalled();
  });

  test("SKIP_IMAGE_BUFFER_COUNTの条件が満たされるまで顔検出しない", async () => {
    (env as MutableEnv).SKIP_IMAGE_BUFFER_COUNT = 1;
    (env as MutableEnv).REKOGNITION_FACE_COUNT = 1;

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(detectFace).not.toHaveBeenCalled();
  });

  test("検出した顔が必要数を満たしていない場合、画像合成が行われない", async () => {
    (env as MutableEnv).SKIP_IMAGE_BUFFER_COUNT = 0;
    (env as MutableEnv).REKOGNITION_FACE_COUNT = 2;

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");
    const mockFaceBuffer = Buffer.from("mockFaceBuffer");

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as jest.Mock).mockResolvedValue(mockFaceBuffer);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(composeImages).not.toHaveBeenCalled();
  });

  test("顔検出されなかった場合、画像合成が行われない", async () => {
    (env as MutableEnv).SKIP_IMAGE_BUFFER_COUNT = 0;
    (env as MutableEnv).REKOGNITION_FACE_COUNT = 1;

    const mockCamera = {
      streamVideo: mockStreamVideo,
    } as unknown as RingCamera;
    const mockImageBuffer = Buffer.from("mockImageBuffer");

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as jest.Mock).mockResolvedValue(undefined);

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    expect(composeImages).not.toHaveBeenCalled();
  });

  test("顔認識ができたらWebhookをトリガーする", async () => {
    (env as MutableEnv).SKIP_IMAGE_BUFFER_COUNT = 0;
    (env as MutableEnv).REKOGNITION_FACE_COUNT = 1;

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

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue("mockRefreshToken");

    mockStreamVideo.mockImplementation(async (options: FfmpegOptions) => {
      setImmediate(() => {
        assert(options.stdoutCallback);
        options.stdoutCallback(mockImageBuffer);
      });
      return Promise.resolve({
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as jest.Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as jest.Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as jest.Mock).mockResolvedValue(mockRecognizeFace);

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
    (env as MutableEnv).SKIP_IMAGE_BUFFER_COUNT = 0;
    (env as MutableEnv).REKOGNITION_FACE_COUNT = 1;

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

    const mockReadFile = jest.spyOn(fs, "readFile");
    mockReadFile.mockResolvedValue("mockRefreshToken");

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
        stop: jest.fn(),
      }) as unknown as Promise<StreamingSession>;
    });
    (detectFace as jest.Mock).mockResolvedValue(mockFaceBuffer);
    (composeImages as jest.Mock).mockResolvedValue(mockCompositeBuffer);
    (recognizeFace as jest.Mock)
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

    await startFaceRecognition(mockCamera);
    await setTimeout(10);

    jest.runAllTimers();

    expect(stopMock).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
