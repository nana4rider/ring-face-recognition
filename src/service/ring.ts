import env from "@/env";
import logger from "@/logger";
import detectFace from "@/service/face/detect";
import recognizeFace, { RecognizeResult } from "@/service/face/recognize";
import triggerWebhook from "@/service/webhook";
import { composeImages, isJpg } from "@/util/imageUtil";
import assert from "assert";
import dayjs from "dayjs";
import { writeFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { PushNotificationAction, RingApi, RingCamera } from "ring-client-api";

export async function initializeRingCamera(): Promise<RingCamera> {
  const refreshToken = (await readFile(env.REFRESH_TOKEN_PATH, "utf-8")).trim();

  const ringApi = new RingApi({
    refreshToken,
  });

  ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
    logger.info("update Refresh Token");
    writeFileSync(env.REFRESH_TOKEN_PATH, newRefreshToken);
  });

  const cameras = await ringApi.getCameras();
  const camera = !env.RING_CAMERA_ID
    ? cameras[0]
    : cameras.find(({ id }) => id === env.RING_CAMERA_ID);
  if (!camera) {
    throw new Error("Camera Not Found.");
  }

  return camera;
}

export async function startFaceRecognition(camera: RingCamera) {
  let debugDir = "";
  /* istanbul ignore next */
  if (logger.isDebugEnabled()) {
    debugDir = dayjs().format("YYYY-MM-DD-HH-mm-ss");
    await mkdir(path.join("snapshot", debugDir));
  }

  const faceImageBuffers: Buffer[] = [];
  let timeoutTimerId: NodeJS.Timeout | undefined = undefined;

  const handleImageBuffer = async (imageBuffer: Buffer) => {
    if (
      faceImageBuffers.length > env.REKOGNITION_FACE_COUNT ||
      !isJpg(imageBuffer)
    ) {
      return;
    }

    logger.info(`receive buffer length: ${imageBuffer.length}`);
    const faceBuffer = await detectFace(imageBuffer);

    void writeDebugFile(imageBuffer, debugDir, faceBuffer ? "ok" : "ng");

    if (!faceBuffer) return;
    logger.info("[Face Detector] 顔検出: OK");

    faceImageBuffers.push(faceBuffer);
    logger.debug(
      `[Face Detector] faceBuffers length: ${faceImageBuffers.length}`,
    );

    if (faceImageBuffers.length !== env.REKOGNITION_FACE_COUNT) {
      return;
    }

    logger.info("画像の合成開始");
    const compositeFaceImageBuffer = await composeImages(faceImageBuffers);
    logger.info("画像の合成完了");

    void writeDebugFile(compositeFaceImageBuffer, debugDir, "comp");

    let result: RecognizeResult | undefined;
    try {
      result = await recognizeFace(compositeFaceImageBuffer);
    } catch (err) {
      // Face Detectorは顔と認識したが外部APIでは検出されない = 画像が荒い可能性が高い
      // より後の画像の方が信用が高いので、1から収集する
      faceImageBuffers.length = 0;
      logger.warn("[Recognition] Failed:", err);
      return;
    }

    // 顔認識が成功したらストリームを停止する
    logger.info("stop stream");
    assert(timeoutTimerId);
    clearTimeout(timeoutTimerId);
    timeoutTimerId = undefined;
    videoStream.stop();

    if (!result) return;

    logger.info(`[Recognition] recognize: ${JSON.stringify(result)}`);
    await triggerWebhook({
      type: "recognition",
      result,
    });
  };

  const videoStream = await camera.streamVideo({
    output: [
      // FPS
      "-vf",
      `fps=${env.VIDEO_STREAM_FPS}`,
      // 音なし
      "-an",
      // 画像ファイルをpipeにストリームする
      "-f",
      "image2pipe",
      // コーデック
      "-vcodec",
      "mjpeg",
      // 標準出力
      "pipe:1",
    ],
    stdoutCallback: (imageBuffer) => {
      if (timeoutTimerId) {
        void handleImageBuffer(imageBuffer);
      }
    },
  });

  timeoutTimerId = setTimeout(() => {
    videoStream.stop();
  }, env.DETECT_TIMEOUT);

  logger.info("[Ring] start stream");
}

export function setupCameraEventListeners(camera: RingCamera) {
  camera.onNewNotification.subscribe((notification) => {
    const category = notification.android_config
      .category as PushNotificationAction;
    logger.info(`[Ring] Notification: ${category}`);

    if (category === PushNotificationAction.Motion) {
      void startFaceRecognition(camera).catch((err) => {
        logger.error("[Ring] startFaceRecognition:", err);
      });
      void triggerWebhook({
        type: "notification",
        event: "motion",
      });
    } else if (category === PushNotificationAction.Ding) {
      void triggerWebhook({
        type: "notification",
        event: "ding",
      });
    }
  });
}

async function writeDebugFile(
  imageBuffer: Buffer,
  targetDir: string,
  suffix: string,
) {
  /* istanbul ignore next */
  if (logger.isDebugEnabled()) {
    const timestamp = dayjs().format("YYYY-MM-DD-HH-mm-ss-SSS");
    const fileName = `${timestamp}_${suffix}.jpg`;
    await writeFile(path.join("snapshot", targetDir, fileName), imageBuffer);
  }
}
