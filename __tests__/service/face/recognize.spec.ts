import env from "@/env";
import recognizeFace from "@/service/face/recognize";
import {
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { MutableEnv } from "jest.setup";

describe("recognizeFace", () => {
  test("一致する顔が見つかった場合、顔の詳細を返す", async () => {
    const mockSend: jest.SpyInstance = jest.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValue({
      FaceMatches: [
        {
          Face: {
            FaceId: "testFaceId",
            ImageId: "testImageId",
            ExternalImageId: "externalImageId",
            Confidence: 98,
          },
          Similarity: 97,
        },
      ],
      SearchedFaceConfidence: 99,
    });

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          CollectionId: "test-collection-id",
          FaceMatchThreshold: undefined,
          Image: { Bytes: mockImageBuffer },
          MaxFaces: 1,
        },
      }),
    );
    expect(result).toEqual({
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: "externalImageId",
    });
  });

  test("externalImageIdが未設定の場合、nullを返す", async () => {
    const mockSend: jest.SpyInstance = jest.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValue({
      FaceMatches: [
        {
          Face: {
            FaceId: "testFaceId",
            ImageId: "testImageId",
            Confidence: 98,
          },
          Similarity: 97,
        },
      ],
      SearchedFaceConfidence: 99,
    });

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          CollectionId: "test-collection-id",
          FaceMatchThreshold: undefined,
          Image: { Bytes: mockImageBuffer },
          MaxFaces: 1,
        },
      }),
    );
    expect(result).toEqual({
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: null,
    });
  });

  test("FaceMatchesが空の場合、undefinedを返す", async () => {
    const mockSend: jest.SpyInstance = jest.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockReturnValueOnce({
      FaceMatches: [],
      SearchedFaceConfidence: 0,
    });

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(SearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("一致する顔が見つからなかった場合、undefinedを返す", async () => {
    const mockSend: jest.SpyInstance = jest.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockReturnValueOnce(
      Promise.resolve({
        FaceMatches: undefined,
        SearchedFaceConfidence: 99,
      }),
    );

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(SearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("FACE_MATCH_THRESHOLDが設定されている場合、FaceMatchThresholdを設定する", async () => {
    (env as MutableEnv).FACE_MATCH_THRESHOLD = 90;

    const mockSend: jest.SpyInstance = jest.spyOn(
      RekognitionClient.prototype,
      "send",
    );

    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValue({
      FaceMatches: [],
      SearchedFaceConfidence: 0,
    });

    await recognizeFace(mockImageBuffer);
    // Number of calls: 0
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          CollectionId: "test-collection-id",
          FaceMatchThreshold: 90,
          Image: { Bytes: mockImageBuffer },
          MaxFaces: 1,
        },
      }),
    );
  });
});
