import { jest } from "@jest/globals";

const mockResponse = jest.fn<() => Response>();

global.fetch = jest
  .fn<typeof global.fetch>()
  .mockImplementation((_input: RequestInfo | URL, _init?: RequestInit) => {
    return Promise.resolve(mockResponse());
  });

describe("triggerWebhook", () => {
  const WEBHOOK = "https://example.com/webhook";

  const env = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  test("ok:trueの場合、正常終了", async () => {
    process.env.WEBHOOK = WEBHOOK;
    const mockPayload = { key: "value" };

    mockResponse.mockReturnValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    } as Response);

    const { default: triggerWebhook } = await import("@/service/webhook");
    const actual = triggerWebhook(mockPayload);

    await expect(actual).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mockPayload),
    });
  });

  test("ok:falseの場合、例外を投げる", async () => {
    process.env.WEBHOOK = WEBHOOK;
    const mockPayload = { key: "value" };

    mockResponse.mockReturnValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Error Message"),
    } as Response);

    const { default: triggerWebhook } = await import("@/service/webhook");
    const actual = triggerWebhook(mockPayload);

    await expect(actual).rejects.toThrow("Error Message");
  });
});
