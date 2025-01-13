import env from "@/env";
import logger from "@/logger";
import { blobToBuffer, bufferToBlob } from "@/util/dataTransformUtil";

export default async function detectFace(
  imageBuffer: Buffer,
): Promise<Buffer | undefined> {
  const reqBlob = bufferToBlob(imageBuffer);
  const formData = new FormData();
  formData.append("minSize", env.DETECT_MIN_SIZE.toString());
  if (env.DETECT_START_X) {
    formData.append("startX", env.DETECT_START_X.toString());
  }
  if (env.DETECT_START_Y) {
    formData.append("startY", env.DETECT_START_Y.toString());
  }
  if (env.DETECT_END_X) {
    formData.append("endX", env.DETECT_END_X.toString());
  }
  if (env.DETECT_END_Y) {
    formData.append("endY", env.DETECT_END_Y.toString());
  }
  if (env.DETECT_CONFIDENCE) {
    formData.append("confidence", env.DETECT_CONFIDENCE.toString());
  }
  formData.append("file", reqBlob, "image.jpg");

  const response = await fetch(`${env.FACE_DETECTOR_API}/detect`, {
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
