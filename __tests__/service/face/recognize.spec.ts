import { jest } from "@jest/globals";

const mockSend = jest.fn();
const mockSearchFacesByImageCommand = jest.fn();

jest.mock("@aws-sdk/client-rekognition", () => ({
  RekognitionClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  SearchFacesByImageCommand: mockSearchFacesByImageCommand,
}));

describe("recognizeFace", () => {
  const env = process.env;
  const AWS_REKOGNITION_COLLECTION_ID = "test-collection-id";
  const FACE_MATCH_THRESHOLD = 95;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
    process.env.AWS_REKOGNITION_COLLECTION_ID = AWS_REKOGNITION_COLLECTION_ID;
    process.env.FACE_MATCH_THRESHOLD = FACE_MATCH_THRESHOLD.toString();
    mockSend.mockReset();
  });

  test("一致する顔が見つかった場合、顔の詳細を返す", async () => {
    const mockImageBuffer = Buffer.from("mockBuffer");
    const mockFace = {
      FaceId: "12345",
      Confidence: 98,
    };
    const mockSimilarity = 97;

    mockSend.mockReturnValueOnce(
      Promise.resolve({
        FaceMatches: [
          {
            Face: mockFace,
            Similarity: mockSimilarity,
          },
        ],
        SearchedFaceConfidence: 99,
      }),
    );

    const { default: recognizeFace } = await import("@/service/face/recognize");
    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(mockSearchFacesByImageCommand),
    );
    expect(result).toEqual(mockFace);
  });

  test("顔が見つからないなどでエラーが発生した場合、undefinedを返す", async () => {
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockReturnValue(
      Promise.reject(Error("InvalidParameterException")),
    );

    const { default: recognizeFace } = await import("@/service/face/recognize");
    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(mockSearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("FaceMatchesが空の場合、undefinedを返す", async () => {
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockReturnValueOnce({
      FaceMatches: [],
      SearchedFaceConfidence: 0,
    });

    const { default: recognizeFace } = await import("@/service/face/recognize");
    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(mockSearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("一致する顔が見つからなかった場合、undefinedを返す", async () => {
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockReturnValueOnce(
      Promise.resolve({
        FaceMatches: undefined,
        SearchedFaceConfidence: 99,
      }),
    );

    const { default: recognizeFace } = await import("@/service/face/recognize");
    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(mockSearchFacesByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("FACE_MATCH_THRESHOLDが設定されていない場合、デフォルト値を使用する", async () => {
    delete process.env.FACE_MATCH_THRESHOLD;

    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockReturnValue(
      Promise.resolve({
        FaceMatches: [],
        SearchedFaceConfidence: 0,
      }),
    );

    const { default: recognizeFace } = await import("@/service/face/recognize");
    await recognizeFace(mockImageBuffer);

    expect(mockSearchFacesByImageCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        FaceMatchThreshold: 95,
      }),
    );
  });
});
