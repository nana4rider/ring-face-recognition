import logger from "@/logger";
import detectFace from "@/service/face/detect";
import recognizeFace from "@/service/face/recognize";
import triggerWebhook from "@/service/webhook";
import { composeImages } from "@/util/imageUtil";
import assert from "assert";
import dayjs from "dayjs";
import env from "env-var";
import { writeFileSync } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { glob } from "glob";
import path from "path";
import { PushNotificationAction, RingApi, RingCamera } from "ring-client-api";

/** 指定がなければ1番目のカメラを使う */
const RING_CAMERA_ID = env.get("RING_CAMERA_ID").asIntPositive();
/** リフレッシュトークンのパス */
const REFRESH_TOKEN_PATH = env
  .get("REFRESH_TOKEN_PATH")
  .default(".refreshToken")
  .asString();
/** ビデオストリームを開始してから自動終了するまでの時間 */
const DETECT_TIMEOUT = env.get("DETECT_TIMEOUT").default(15000).asIntPositive();
/** Rekognition APIに渡す顔の数 */
const REKOGNITION_FACE_COUNT = env
  .get("REKOGNITION_FACE_COUNT")
  .default(3)
  .asIntPositive();
/** スキップする画像の回数(接続して最初の方の画像は壊れていることが多いため指定) */
const SKIP_IMAGE_BUFFER_COUNT = env
  .get("SKIP_IMAGE_BUFFER_COUNT")
  .default(3)
  .asIntPositive();
/** FFmpegの設定 */
const STREAM_VIDEO_CONFIG = [
  // FPS
  "-vf",
  `fps=3`,
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
];

export async function initializeRingCamera(): Promise<RingCamera> {
  const refreshToken = (await readFile(REFRESH_TOKEN_PATH, "utf-8")).trim();

  const ringApi = new RingApi({
    refreshToken,
  });

  ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
    logger.info("update Refresh Token");
    writeFileSync(REFRESH_TOKEN_PATH, newRefreshToken);
  });

  const cameras = await ringApi.getCameras();
  const camera = !RING_CAMERA_ID
    ? cameras[0]
    : cameras.find(({ id }) => id === RING_CAMERA_ID);
  if (!camera) {
    throw new Error("Camera Not Found.");
  }

  return camera;
}

export async function startFaceRecognition(camera: RingCamera) {
  void removeDebugFiles();

  const faceImageBuffers: Buffer[] = [];
  let timeoutTimerId: NodeJS.Timeout | undefined = undefined;

  const handleImageBuffer = async (imageBuffer: Buffer) => {
    logger.info(`receive buffer length: ${imageBuffer.length}`);
    const faceBuffer = await detectFace(imageBuffer);

    void writeDebugFile(imageBuffer, faceBuffer ? "ok" : "ng");

    if (!faceBuffer) return;
    logger.info("[Face Detector] 顔検出: OK");

    faceImageBuffers.push(faceBuffer);
    logger.debug(
      `[Face Detector] faceBuffers length: ${faceImageBuffers.length}`,
    );

    if (faceImageBuffers.length !== REKOGNITION_FACE_COUNT) {
      return;
    }

    logger.info("stop stream");
    assert(timeoutTimerId);
    clearTimeout(timeoutTimerId);
    timeoutTimerId = undefined;
    videoStream.stop();

    logger.info("画像の合成開始");
    const compositeFaceImageBuffer = await composeImages(faceImageBuffers);
    logger.info("画像の合成完了");

    void writeDebugFile(compositeFaceImageBuffer, "comp");

    const face = await recognizeFace(compositeFaceImageBuffer);
    if (!face) return;
    const { FaceId: faceId, ExternalImageId: imageId } = face;

    logger.info(`[Rekognition] recognize: ${JSON.stringify(face)}`);
    await triggerWebhook({
      type: "rekognition",
      result: {
        ...(faceId ? { faceId } : undefined),
        ...(imageId ? { imageId } : undefined),
      },
    });
  };

  let callbackCounter = 0;
  const videoStream = await camera.streamVideo({
    output: STREAM_VIDEO_CONFIG,
    stdoutCallback: (imageBuffer) => {
      callbackCounter++;
      if (timeoutTimerId && callbackCounter > SKIP_IMAGE_BUFFER_COUNT) {
        void handleImageBuffer(imageBuffer);
      }
    },
  });

  timeoutTimerId = setTimeout(() => {
    videoStream.stop();
  }, DETECT_TIMEOUT);

  logger.info("[Ring] start stream");
}

export function setupCameraEventListeners(camera: RingCamera) {
  camera.onNewNotification.subscribe((notification) => {
    const category = notification.android_config
      .category as PushNotificationAction;
    logger.info(`[Ring] Notification: ${category}`);

    if (category === PushNotificationAction.Motion) {
      void startFaceRecognition(camera).catch((err) => {
        logger.error("processStream:", err);
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

async function writeDebugFile(imageBuffer: Buffer, suffix: string) {
  /* istanbul ignore next */
  if (logger.isDebugEnabled()) {
    const timestamp = dayjs().format("YYYY-MM-DD-HH-mm-ss-SSS");
    const fileName = `${timestamp}_${suffix}.jpg`;
    await writeFile(path.join("snapshot", fileName), imageBuffer);
  }
}

async function removeDebugFiles() {
  /* istanbul ignore next */
  if (logger.isDebugEnabled()) {
    const snapshotFileNames = await glob("snapshot/*.jpg");
    await Promise.all(snapshotFileNames.map((fileName) => rm(fileName)));
  }
}
