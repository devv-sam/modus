import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type Validator<T> = (value: unknown) => T | null;

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

export class Llm {
  private readonly client: OpenAI;

  constructor(
    baseUrl: string,
    private readonly model: string,
  ) {
    // the SDK requires a key; Ollama ignores it
    this.client = new OpenAI({
      baseURL: `${baseUrl.replace(/\/+$/, "")}/v1`,
      apiKey: "ollama",
      timeout: 120_000,
      maxRetries: 0,
    });
  }

  /** Single-shot JSON completion. Retries once if the output fails validation. */
  async json<T>(system: string, user: string, validate: Validator<T>, maxTokens = 300): Promise<T> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    for (let attempt = 0; ; attempt++) {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      });
      const raw = res.choices[0]?.message?.content ?? "";
      const value = validate(parseJson(raw));
      if (value !== null) return value;
      if (attempt === 1) throw new Error(`Model returned invalid output: ${raw.slice(0, 200)}`);
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: "That was invalid. Reply with only the JSON object in the required shape." },
      );
    }
  }
}
