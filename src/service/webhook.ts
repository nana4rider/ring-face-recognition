import env from "@/env";
import { JsonValue } from "type-fest";

export default async function triggerWebhook(
  payload: JsonValue,
): Promise<void> {
  const response = await fetch(env.WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}
