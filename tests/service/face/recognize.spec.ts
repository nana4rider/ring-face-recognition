import recognizeFace from "@/service/face/recognize";
import type {
  FaceMatch,
  SearchFacesByImageCommandOutput,
} from "@aws-sdk/client-rekognition";
import {
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import type { MockInstance } from "vitest";

type RekognitionSend = MockInstance<
  (
    command: SearchFacesByImageCommand,
  ) => Promise<SearchFacesByImageCommandOutput>
>;

describe("recognizeFace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("一致する顔が見つかった場合、顔の詳細を返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
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
    } as SearchFacesByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
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
    const mockSend: RekognitionSend = vi.spyOn(
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
    } as SearchFacesByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({
      CollectionId: "test-collection-id",
      Image: { Bytes: mockImageBuffer },
      MaxFaces: 1,
    });
    expect(result).toEqual({
      faceId: "testFaceId",
      imageId: "testImageId",
      externalImageId: null,
    });
  });

  test("FaceMatchesが空の場合、undefinedを返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValueOnce({
      FaceMatches: [] as FaceMatch,
      SearchedFaceConfidence: 0,
    } as SearchFacesByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      expect.any(SearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("一致する顔が見つからなかった場合、undefinedを返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValueOnce({
      FaceMatches: undefined,
      SearchedFaceConfidence: 99,
    } as SearchFacesByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      expect.any(SearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("FACE_MATCH_THRESHOLDが設定されている場合、閾値を下回った検出があるとundefinedを返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
      RekognitionClient.prototype,
      "send",
    );

    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValue({
      FaceMatches: [{ Similarity: 80, Face: {} }],
      SearchedFaceConfidence: 80,
    } as SearchFacesByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(result).toBeUndefined();
  });
});
