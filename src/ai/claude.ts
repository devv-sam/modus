const API_URL = "https://api.anthropic.com/v1/messages";

export async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  userContent: string,
  maxTokens = 512,
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { content: Array<{ type: string; text: string }> };
  return body.content.find((b) => b.type === "text")?.text ?? "";
}
