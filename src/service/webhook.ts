import env from "env-var";
import { JsonValue } from "type-fest";

const WEBHOOK = env.get("WEBHOOK").required().asString();

export default async function triggerWebhook(
  payload: JsonValue,
): Promise<void> {
  const response = await fetch(WEBHOOK, {
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
