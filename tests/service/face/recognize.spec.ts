import recognizeFace from "@/service/face/recognize";
import type { SearchUsersByImageCommandOutput } from "@aws-sdk/client-rekognition";
import {
  RekognitionClient,
  SearchUsersByImageCommand,
} from "@aws-sdk/client-rekognition";
import type { MockInstance } from "vitest";

type RekognitionSend = MockInstance<
  (
    command: SearchUsersByImageCommand,
  ) => Promise<SearchUsersByImageCommandOutput>
>;

describe("recognizeFace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("一致するユーザーが見つかった場合、ユーザーIDを返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValue({
      UserMatches: [
        {
          User: {
            UserId: "testUserId",
          },
          Similarity: 97,
        },
      ],
    } as SearchUsersByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        input: {
          CollectionId: "test-collection-id",
          Image: { Bytes: mockImageBuffer },
          MaxUsers: 1,
        },
      }),
    );
    expect(result).toEqual({
      userId: "testUserId",
      similarity: 97,
    });
  });

  test("UserMatchesが空の場合、undefinedを返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValueOnce({
      UserMatches: [],
    } as unknown as SearchUsersByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      expect.any(SearchUsersByImageCommand),
    );
    expect(result).toBeUndefined();
  });

  test("一致するユーザーが見つからなかった場合、undefinedを返す", async () => {
    const mockSend: RekognitionSend = vi.spyOn(
      RekognitionClient.prototype,
      "send",
    );
    const mockImageBuffer = Buffer.from("mockBuffer");

    mockSend.mockResolvedValueOnce({
      UserMatches: undefined,
    } as SearchUsersByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      expect.any(SearchUsersByImageCommand),
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
      UserMatches: [
        {
          Similarity: 80,
          User: { UserId: "testUserId" },
        },
      ],
    } as SearchUsersByImageCommandOutput);

    const result = await recognizeFace(mockImageBuffer);

    expect(result).toBeUndefined();
  });
});
