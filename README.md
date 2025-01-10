# Ring Face Recognition

[![License: ISC](https://img.shields.io/github/license/nana4rider/ring-face-recognition)](LICENSE)
![GitHub Actions Test](https://github.com/nana4rider/ring-face-recognition/actions/workflows/test.yml/badge.svg)
![GitHub Actions Release](https://github.com/nana4rider/ring-face-recognition/actions/workflows/release.yml/badge.svg)

## 概要

Ring Doorbellで顔認識するためのアプリケーションです。

## フロー

```mermaid
graph TD
    motion[Ringのモーションを検知] --> startStream[ストリーミングを開始]
    startStream --> detectFace[受け取った画像をface-detectorに送信し顔を検出]
    detectFace -->|必要な検出数を満たした| composeImages[検出した画像を合成]
    detectFace -->|必要な検出数を満たさない| detectFace
    composeImages --> recognizeFace[合成した画像をAmazon Rekognitionに送信する]
    recognizeFace -->|一致あり| triggerWebhook[一致した顔のIDをWebhookで通知]
    triggerWebhook -->stopStream
    recognizeFace -->|一致なし| stopStream[ストリーミングを終了]
```

## リンク

- [Face Detector](https://github.com/nana4rider/face-detector)
- [Amazon Rekognition API SearchFacesByImageCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/SearchFacesByImageCommand/)
