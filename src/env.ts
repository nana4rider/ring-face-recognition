import { cleanEnv, num, port, str, testOnly, url } from "envalid";

const env = cleanEnv(process.env, {
  AWS_REKOGNITION_COLLECTION_ID: str({
    desc: "RekognitionのコレクションID",
    devDefault: testOnly("test-collection-id"),
  }),
  FACE_MATCH_THRESHOLD: num({
    desc: "https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/SearchFacesByImageCommand/",
    default: undefined,
    devDefault: testOnly(90),
  }),
  LOG_LEVEL: str({ desc: "ログレベル", default: "info" }),
  PORT: port({
    desc: "HTTPサーバーのポート",
    default: 3000,
    devDefault: testOnly(0),
  }),
  FACE_DETECTOR_API: url({
    desc: "https://nana4rider.github.io/openapi-ui/?face-detector#/default/post_detect",
    example: "http://face-detector.local",
    devDefault: testOnly("http://face-detector.local"),
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
    devDefault: testOnly("http://webhool.local"),
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
    devDefault: testOnly(500),
  }),
  RECOGNITION_FACE_COUNT: num({
    desc: "顔認識APIに渡す顔の数",
    default: 3,
  }),
  RECOGNITION_MAX_RETRIES: num({
    desc: "リトライ回数",
    default: 2,
  }),
  VIDEO_STREAM_FPS: num({
    desc: "ビデオストリームのFPS",
    default: 3,
  }),
});

export default env;
