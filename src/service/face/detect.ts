import logger from "@/logger";
import { blobToBuffer, bufferToBlob } from "@/util/dataTransformUtil";
import env from "env-var";

const FACE_DETECTOR_API = env.get("FACE_DETECTOR_API").required().asString();
// 検出範囲を狭めるとパフォーマンスが向上する
const DETECT_X1 = env.get("DETECT_X1").asString();
const DETECT_Y1 = env.get("DETECT_Y1").asString();
const DETECT_X2 = env.get("DETECT_X2").asString();
const DETECT_Y2 = env.get("DETECT_Y2").asString();
// 80px以上ないとRekognitionが受け付けない
const DETECT_MIN_SIZE = env.get("DETECT_MIN_SIZE").default(80).asIntPositive();

export default async function detectFace(
  imageBuffer: Buffer,
): Promise<Buffer | undefined> {
  const reqBlob = bufferToBlob(imageBuffer);
  const formData = new FormData();

  if (DETECT_X1) formData.append("x1", DETECT_X1);
  if (DETECT_Y1) formData.append("y1", DETECT_Y1);
  if (DETECT_X2) formData.append("x2", DETECT_X2);
  if (DETECT_Y2) formData.append("y2", DETECT_Y2);
  formData.append("minSize", DETECT_MIN_SIZE.toString());
  formData.append("file", reqBlob, "image.jpg");

  const response = await fetch(`${FACE_DETECTOR_API}/detect`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    if (logger.isDebugEnabled()) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json: { error: string } = await response.json();
      logger.info(`response: ${json.error}`);
    }
    return undefined;
  }

  return blobToBuffer(await response.blob());
}
