import logger from "@/logger";
import { blobToBuffer, bufferToBlob } from "@/util/dataTransformUtil";
import env from "env-var";

const FACE_DETECTOR_API = env.get("FACE_DETECTOR_API").required().asString();
// 80px以上ないとRekognitionが受け付けない
const DETECT_MIN_SIZE = env.get("DETECT_MIN_SIZE").default(80).asIntPositive();
const DETECT_CONFIDENCE = env.get("DETECT_CONFIDENCE").asFloatPositive();

export default async function detectFace(
  imageBuffer: Buffer,
): Promise<Buffer | undefined> {
  const reqBlob = bufferToBlob(imageBuffer);
  const formData = new FormData();
  formData.append("minSize", DETECT_MIN_SIZE.toString());
  if (DETECT_CONFIDENCE) {
    formData.append("confidence", DETECT_CONFIDENCE.toString());
  }
  formData.append("file", reqBlob, "image.jpg");

  const response = await fetch(`${FACE_DETECTOR_API}/detect`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    /* istanbul ignore next */
    if (logger.isDebugEnabled()) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json: { error: string } = await response.json();
      logger.info(`response: ${json.error}`);
    }
    return undefined;
  }

  return blobToBuffer(await response.blob());
}
