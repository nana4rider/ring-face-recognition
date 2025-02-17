import logger from "@/logger";
import initializeHttpServer from "@/service/http";
import {
  initializeRingCamera,
  setupCameraEventListeners,
} from "@/service/ring";

async function main() {
  const camera = await initializeRingCamera();
  logger.info(`[Ring] Target Camera: ${camera.name}`);
  setupCameraEventListeners(camera);

  const http = await initializeHttpServer();

  const handleShutdown = async () => {
    logger.info("shutdown");
    await http.close();
    camera.disconnect();
    logger.info("[Ring] disconnect");
    process.exit(0);
  };

  process.on("SIGINT", () => void handleShutdown());
  process.on("SIGTERM", () => void handleShutdown());
}

try {
  await main();
} catch (err) {
  logger.error("main() error:", err);
  process.exit(1);
}
