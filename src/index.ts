import logger from "@/logger";
import detectFace from "@/service/face/detect";
import recognizeFace from "@/service/face/recognize";
import initializeRingCamera from "@/service/ring";
import triggerWebhook from "@/service/webhook";
import { composeImages } from "@/util/imageUtil";
import assert from "assert";
import dayjs from "dayjs";
import env from "env-var";
import { rm, writeFile } from "fs/promises";
import { glob } from "glob";
import http from "http";
import path from "path";
import { PushNotificationAction, RingCamera } from "ring-client-api";
import { promisify } from "util";

const PORT = env.get("PORT").default(3000).asPortNumber();
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

async function processStream(camera: RingCamera) {
  // debug image
  if (logger.isDebugEnabled()) {
    logger.info("デバッグ画像削除開始");
    const snapshotFileNames = await glob("snapshot/*.jpg");
    await Promise.all(snapshotFileNames.map((fileName) => rm(fileName)));
    logger.info("デバッグ画像削除完了");
  }

  const faceImageBuffers: Buffer[] = [];
  let timeoutTimerId: NodeJS.Timeout | undefined = undefined;

  const handleImageBuffer = async (imageBuffer: Buffer) => {
    logger.info(`receive buffer length: ${imageBuffer.length}`);
    const faceBuffer = await detectFace(imageBuffer);

    // debug image
    if (logger.isDebugEnabled()) {
      const ts = dayjs().format("YYYY-MM-DD-HH-mm-ss-SSS");
      const fileName = `${ts}_${faceBuffer ? "ok" : "ng"}.jpg`;
      void writeFile(path.join("snapshot", fileName), imageBuffer);
    }

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

    // debug image
    if (logger.isDebugEnabled()) {
      const ts = dayjs().format("YYYY-MM-DD-HH-mm-ss-SSS");
      const fileName = `${ts}_comp.jpg`;
      void writeFile(path.join("snapshot", fileName), compositeFaceImageBuffer);
    }

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
        void handleImageBuffer(imageBuffer).catch((err) => {
          logger.error("handleImage:", err);
        });
      }
    },
  });

  timeoutTimerId = setTimeout(() => {
    videoStream.stop();
  }, DETECT_TIMEOUT);

  logger.info("[Ring] start stream");
}

async function main() {
  const camera = await initializeRingCamera();
  logger.info(`[Ring] Target Camera: ${camera.name}`);

  camera.onNewNotification.subscribe((notification) => {
    const { category } = notification.android_config;
    logger.info(`[Ring] Notification: ${category}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (category === PushNotificationAction.Motion) {
      void processStream(camera).catch((err) => {
        logger.error("processStream:", err);
      });
      void triggerWebhook({
        type: "notification",
        event: "motion",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (category === PushNotificationAction.Ding) {
      void triggerWebhook({
        type: "notification",
        event: "ding",
      });
    }
  });

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({}));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await promisify(server.listen.bind(server, PORT))();
  logger.info(`Health check server running on port ${PORT}`);

  const shutdownHandler = async () => {
    logger.info("shutdown");
    await promisify(server.close.bind(server))();
    logger.info("[HTTP] closed");
    camera.disconnect();
    logger.info("[Ring] disconnect");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdownHandler());
  process.on("SIGTERM", () => void shutdownHandler());
}

await main();
