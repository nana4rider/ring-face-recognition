# Ring Face Rekognition

Ring Doorbellで顔認識するためのアプリケーションです。

### フロー

```mermaid
graph TD
    motion[Ringのモーションを検知] --> startStream[ストリーミングを開始]
    startStream --> detectFace[受け取った画像をface-detectorに送信し顔を検出]
    detectFace -->|必要な検出数を満たした| composeImages[検出した画像を横並びに合成]
    detectFace -->|必要な検出数を満たさない| detectFace
    composeImages --> recognizeFace[合成した画像をAmazon Rekognitionに送信する]
    recognizeFace -->|一致あり| triggerWebhook[一致した顔のIDをWebhookで通知]
    triggerWebhook -->stopStream
    recognizeFace -->|一致なし| stopStream[ストリーミングを終了]
```

### リンク

- [Face Detector](https://github.com/nana4rider/face-detector)
- [Amazon Rekognition API SearchFacesByImageCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/SearchFacesByImageCommand/)
