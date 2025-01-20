import env from "@/env";
import logger from "@/logger";
import initializeHttpServer from "@/service/http";
import { startFaceRecognition } from "@/service/ring";
import { FastifyInstance } from "fastify";
import { MutableEnv } from "jest.setup";
import { RingCamera } from "ring-client-api";

jest.mock("@/service/ring", () => ({
  startFaceRecognition: jest.fn(),
}));

describe("initializeHttpServer", () => {
  let server: FastifyInstance;
  const mockCamera = {} as RingCamera;

  beforeEach(async () => {
    (env as MutableEnv).USE_EXTERNAL_MOTION_TRIGGER = true;
    (env as MutableEnv).PORT = undefined;
    jest.clearAllMocks();
    server = await initializeHttpServer(mockCamera);
  });

  afterEach(async () => {
    await server.close();
  });

  test("/health エンドポイントでヘルスステータスが返されること", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      uptime: expect.any(Number) as number,
      timestamp: expect.any(Number) as number,
    });
  });

  describe("/motion POST", () => {
    test("USE_EXTERNAL_MOTION_TRIGGER が true の場合に顔認識がトリガーされること", async () => {
      (startFaceRecognition as jest.Mock).mockResolvedValue(undefined);

      const response = await server.inject({
        method: "POST",
        url: "/motion",
      });

      expect(response.statusCode).toBe(202);
      expect(startFaceRecognition).toHaveBeenCalledWith(mockCamera);
    });

    test("USE_EXTERNAL_MOTION_TRIGGER が false の場合に 403 を返すこと", async () => {
      (env as MutableEnv).USE_EXTERNAL_MOTION_TRIGGER = false;
      (startFaceRecognition as jest.Mock).mockResolvedValue(undefined);

      const response = await server.inject({
        method: "POST",
        url: "/motion",
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        message: "env.USE_EXTERNAL_MOTION_SENSOR is not true.",
        status: "failed",
      });

      expect(startFaceRecognition).not.toHaveBeenCalled();
    });

    test("startFaceRecognition がエラーをスローした場合にエラーがログに記録されること", async () => {
      const logErrorSpy = jest.spyOn(logger, "error");

      const error = new Error("Test error");
      (startFaceRecognition as jest.Mock).mockRejectedValueOnce(error);

      const response = await server.inject({
        method: "POST",
        url: "/motion",
      });

      expect(response.statusCode).toBe(202);
      expect(logErrorSpy).toHaveBeenCalledWith(
        "[Ring] startFaceRecognition:",
        error,
      );
    });
  });
});
