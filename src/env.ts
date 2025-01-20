import { bool, cleanEnv, num, port, str, url } from "envalid";

const env = cleanEnv(process.env, {
  AWS_REKOGNITION_COLLECTION_ID: str({ desc: "RekognitionのコレクションID" }),
  FACE_MATCH_THRESHOLD: num({
    desc: "https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/SearchFacesByImageCommand/",
    default: undefined,
  }),
  LOG_LEVEL: str({ desc: "ログレベル", default: "info" }),
  PORT: port({
    desc: "HTTPサーバーのポート",
    default: 3000,
  }),
  //
  FACE_DETECTOR_API: url({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect",
    example: "http://face-detector.local",
  }),
  DETECT_MIN_SIZE: num({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect 80px以上ないとRekognitionが受け付けない",
    default: 80,
  }),
  DETECT_START_X: num({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect",
    default: undefined,
  }),
  DETECT_START_Y: num({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect",
    default: undefined,
  }),
  DETECT_END_X: num({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect",
    default: undefined,
  }),
  DETECT_END_Y: num({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect",
    default: undefined,
  }),
  WEBHOOK: url({
    desc: "イベントを通知するWebhook",
    example: "http://webhool.local",
  }),
  RING_CAMERA_ID: num({
    desc: "RingのカメラID 指定がなければ1番目のカメラを使う",
    default: undefined,
  }),
  REFRESH_TOKEN_PATH: str({
    desc: "リフレッシュトークンのパス",
    default: ".refreshToken",
  }),
  DETECT_TIMEOUT: num({
    desc: "ビデオストリームを開始してから自動終了するまでの時間",
    default: 15000,
  }),
  REKOGNITION_FACE_COUNT: num({
    desc: "Rekognition APIに渡す顔の数",
    default: 3,
  }),
  VIDEO_STREAM_FPS: num({
    desc: "ビデオストリームのFPS",
    default: 3,
  }),
  USE_EXTERNAL_MOTION_TRIGGER: bool({
    desc: "外部のモーショントリガーを利用する",
    default: false,
  }),
});

export default env;
