import logger from "@/logger";
import { initializeRingCamera, startFaceRecognition } from "@/service/ring";
import triggerWebhook from "@/service/webhook";
import env from "env-var";
import http from "http";
import { PushNotificationAction } from "ring-client-api";
import { promisify } from "util";

const PORT = env.get("PORT").default(3000).asPortNumber();

async function main() {
  const camera = await initializeRingCamera();
  logger.info(`[Ring] Target Camera: ${camera.name}`);

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

try {
  await main();
} catch (err) {
  logger.error("main() error:", err);
  process.exit(1);
}
