import env from "@/env";
import triggerWebhook from "@/service/webhook";

const mockFetchResponse = vi.fn<() => Response>();
vi.stubGlobal(
  "fetch",
  vi.fn<typeof fetch>().mockImplementation((_input, _init) => {
    return Promise.resolve(mockFetchResponse());
  }),
);

describe("triggerWebhook", () => {
  test("ok: true の場合、正常に完了する", async () => {
    const mockPayload = { key: "value" };

    mockFetchResponse.mockReturnValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    } as Response);

    const actual = triggerWebhook(mockPayload);

    await expect(actual).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(env.WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mockPayload),
    });
  });

  test("ok: false の場合、例外を投げる", async () => {
    const mockPayload = { key: "value" };

    mockFetchResponse.mockReturnValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Error Message"),
    } as Response);

    const actual = triggerWebhook(mockPayload);

    await expect(actual).rejects.toThrow("Error Message");
  });
});
