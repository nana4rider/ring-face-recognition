import logger from "@/logger";
import {
  Face,
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import env from "env-var";

const AWS_REKOGNITION_COLLECTION_ID = env
  .get("AWS_REKOGNITION_COLLECTION_ID")
  .required()
  .asString();
const FACE_MATCH_THRESHOLD = env
  .get("FACE_MATCH_THRESHOLD")
  .default(95)
  .asIntPositive();

const rekognition = new RekognitionClient();

export default async function recognizeFace(
  imageBuffer: Buffer,
): Promise<Face | undefined> {
  const command = new SearchFacesByImageCommand({
    CollectionId: AWS_REKOGNITION_COLLECTION_ID,
    FaceMatchThreshold: FACE_MATCH_THRESHOLD,
    Image: { Bytes: imageBuffer },
  });
  const {
    FaceMatches: matches,
    SearchedFaceConfidence: searchedFaceConfidence,
  } = await rekognition.send(command);

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
    `Similarity: ${face.Similarity} / Confidence: ${face.Face.Confidence}`,
  );

  return face.Face;
}
