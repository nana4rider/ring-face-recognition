import env from "@/env";
import logger from "@/logger";
import {
  RekognitionClient,
  SearchUsersByImageCommand,
} from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient();

export type RecognizeResult = {
  userId: string;
  similarity: number;
};

export default async function recognizeFace(
  imageBuffer: Buffer,
): Promise<RecognizeResult | undefined> {
  logger.info("[Rekognition] 開始");

  const command = new SearchUsersByImageCommand({
    CollectionId: env.AWS_REKOGNITION_COLLECTION_ID,
    Image: { Bytes: imageBuffer },
    MaxUsers: 1,
  });

  const result = await rekognition.send(command);

  const { UserMatches: matches } = result;

  const user = matches ? matches.shift() : undefined;
  if (!user?.User?.UserId) {
    logger.info("[Rekognition] 登録されていない");
    return undefined;
  }

  logger.info(`[Rekognition] Similarity: ${user.Similarity}`);

  const similarity = user.Similarity;

  if (
    !similarity ||
    (env.FACE_MATCH_THRESHOLD && env.FACE_MATCH_THRESHOLD > similarity)
  ) {
    logger.info("[Rekognition] 検出されているが閾値を下回っている");
    return undefined;
  }

  return {
    userId: user.User.UserId,
    similarity,
  };
}
