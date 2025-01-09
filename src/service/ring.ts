import logger from "@/logger";
import env from "env-var";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { RingApi, RingCamera } from "ring-client-api";

const RING_CAMERA_ID = env.get("RING_CAMERA_ID").asIntPositive();
const REFRESH_TOKEN_PATH = ".refreshToken";

export default async function initializeRingCamera(): Promise<RingCamera> {
  const refreshToken = (await readFile(REFRESH_TOKEN_PATH, "utf-8")).trim();

  const ringApi = new RingApi({
    refreshToken,
  });

  ringApi.onRefreshTokenUpdated.subscribe(
    ({ newRefreshToken, oldRefreshToken }) => {
      if (!oldRefreshToken) return;
      logger.info("update Refresh Token");
      writeFileSync(REFRESH_TOKEN_PATH, newRefreshToken);
    },
  );

  const cameras = await ringApi.getCameras();
  const camera = !RING_CAMERA_ID
    ? cameras[0]
    : cameras.find(({ id }) => id === RING_CAMERA_ID);
  if (!camera) {
    throw new Error("Camera Not Found.");
  }

  return camera;
}
