import env from "@/env";
import logger from "@/logger";
import {
  Face,
  RekognitionClient,
  SearchFacesByImageCommand,
  SearchFacesByImageCommandOutput,
} from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient();

export default async function recognizeFace(
  imageBuffer: Buffer,
): Promise<Face | undefined> {
  logger.info("[Rekognition] 開始");

  const command = new SearchFacesByImageCommand({
    CollectionId: env.AWS_REKOGNITION_COLLECTION_ID,
    FaceMatchThreshold: env.FACE_MATCH_THRESHOLD,
    Image: { Bytes: imageBuffer },
    MaxFaces: 1,
  });

  let result: SearchFacesByImageCommandOutput;
  try {
    result = await rekognition.send(command);
  } catch (err) {
    logger.error("[Rekognition] エラー", err);
    return undefined;
  }

  const {
    FaceMatches: matches,
    SearchedFaceConfidence: searchedFaceConfidence,
  } = result;

  if (!searchedFaceConfidence) {
    logger.info("[Rekognition] 顔が検出されなかった");
    return undefined;
  }
  const face = matches ? matches.shift() : undefined;
  if (!face?.Face) {
    logger.info("[Rekognition] 登録されていない");
    return undefined;
  }

  logger.info(
    `[Rekognition] Similarity: ${face.Similarity} / Confidence: ${face.Face.Confidence}`,
  );

  return face.Face;
}
