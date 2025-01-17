import env from "@/env";
import logger from "@/logger";
import {
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient();

export type RecognizeResult = {
  faceId: string;
  imageId: string;
  externalImageId: string | null;
};

export default async function recognizeFace(
  imageBuffer: Buffer,
): Promise<RecognizeResult | undefined> {
  logger.info("[Rekognition] 開始");

  const command = new SearchFacesByImageCommand({
    CollectionId: env.AWS_REKOGNITION_COLLECTION_ID,
    Image: { Bytes: imageBuffer },
    MaxFaces: 1,
  });

  const result = await rekognition.send(command);

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

  if (
    face.Similarity &&
    env.FACE_MATCH_THRESHOLD &&
    env.FACE_MATCH_THRESHOLD > face.Similarity
  ) {
    // 検出されているが閾値を下回っている場合は、リトライすると通る可能性があるので例外をスローする
    throw new Error("The similarity score is below the threshold.");
  }

  const faceId = face.Face.FaceId!;
  const imageId = face.Face.ImageId!;
  const externalImageId = face.Face.ExternalImageId ?? null;

  return {
    faceId,
    imageId,
    externalImageId,
  };
}
