import logger from "@/logger";
import {
  Face,
  RekognitionClient,
  SearchFacesByImageCommand,
  SearchFacesByImageCommandOutput,
} from "@aws-sdk/client-rekognition";
import env from "env-var";

const AWS_REKOGNITION_COLLECTION_ID = env
  .get("AWS_REKOGNITION_COLLECTION_ID")
  .required()
  .asString();
const FACE_MATCH_THRESHOLD = env.get("FACE_MATCH_THRESHOLD").asIntPositive();

const rekognition = new RekognitionClient();

export default async function recognizeFace(
  imageBuffer: Buffer,
): Promise<Face | undefined> {
  logger.info("[Rekognition] 開始");

  const command = new SearchFacesByImageCommand({
    CollectionId: AWS_REKOGNITION_COLLECTION_ID,
    FaceMatchThreshold: FACE_MATCH_THRESHOLD,
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
