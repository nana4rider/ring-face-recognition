import { cleanEnv, num, str } from "envalid";

const env = cleanEnv(process.env, {
  // RekognitionのコレクションID
  AWS_REKOGNITION_COLLECTION_ID: str(),
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/SearchFacesByImageCommand/
  FACE_MATCH_THRESHOLD: num({ default: undefined }),
  // ログ出力
  LOG_LEVEL: str({ default: "info" }),
  // HTTPサーバーのポート
  PORT: num({ default: 3000 }),
  // https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect
  FACE_DETECTOR_API: str(),
  // 80px以上ないとRekognitionが受け付けない
  DETECT_MIN_SIZE: num({ default: 80 }),
  DETECT_START_X: num({ default: undefined }),
  DETECT_START_Y: num({ default: undefined }),
  DETECT_END_X: num({ default: undefined }),
  DETECT_END_Y: num({ default: undefined }),
  DETECT_CONFIDENCE: num({ default: undefined }),
  // イベントを通知するWebhook
  WEBHOOK: str(),
  // RingのカメラID 指定がなければ1番目のカメラを使う
  RING_CAMERA_ID: num({ default: undefined }),
  // リフレッシュトークンのパス
  REFRESH_TOKEN_PATH: str({ default: ".refreshToken" }),
  // ビデオストリームを開始してから自動終了するまでの時間
  DETECT_TIMEOUT: num({ default: 15000 }),
  // Rekognition APIに渡す顔の数
  REKOGNITION_FACE_COUNT: num({ default: 3 }),
  // スキップする画像の回数(接続して最初の方の画像は壊れていることが多いため指定)
  SKIP_IMAGE_BUFFER_COUNT: num({ default: 3 }),
});

export default env;
