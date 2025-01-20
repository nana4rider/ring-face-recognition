import env from "@/env";
import logger from "@/logger";
import { startFaceRecognition } from "@/service/ring";
import fastify from "fastify";
import { RingCamera } from "ring-client-api";

export default async function initializeHttpServer(camera: RingCamera) {
  const server = fastify();

  server.get("/health", () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  }));

  server.post("/motion", (res, reply) => {
    if (!env.USE_EXTERNAL_MOTION_TRIGGER) {
      reply.status(403);
      return {
        message: "env.USE_EXTERNAL_MOTION_SENSOR is not true.",
        status: "failed",
      };
    }
    startFaceRecognition(camera).catch((err) => {
      logger.error("[Ring] startFaceRecognition:", err);
    });

    reply.status(202);
    return {
      status: "accepted",
    };
  });

  await server.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info(`[HTTP] listen port: ${env.PORT}`);

  return server;
}
