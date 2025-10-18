import type { Handler } from "@netlify/functions";

type ChatRole = "system" | "user" | "assistant" | "tool";
type ChatMessage = { role: ChatRole; content: string };

type CompletionMinimal = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    search_context_size?: string | null;
    cost?: {
      input_tokens_cost: number;
      output_tokens_cost: number;
      total_cost: number;
      request_cost?: number | null;
      search_queries_cost?: number | null;
      citation_tokens_cost?: number | null;
      reasoning_tokens_cost?: number | null;
    };
  } | null;
  search_results?: Array<{
    title: string;
    url: string;
    date?: string | null;
    last_updated?: string | null;
    snippet?: string;
    source?: "web" | "attachment";
  }>;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const apiKey = process.env.PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing PERPLEXITY_API_KEY on server" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) as {
      prompt?: string;
      messages?: ChatMessage[];
      model?: string;
      temperature?: number;
      searchType?: "pro" | "auto" | "fast";
      searchContextSize?: "low" | "medium" | "high";
    } : {};

    const messages: ChatMessage[] | null =
      Array.isArray(body?.messages) && body.messages.length > 0
        ? body.messages
        : typeof body?.prompt === "string" && body.prompt.trim()
          ? ([{ role: "user", content: String(body.prompt) }] as ChatMessage[])
          : null;

    if (!messages) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Provide prompt or messages" }),
      };
    }

    const { default: Perplexity } = await import("@perplexity-ai/perplexity_ai");
    const client = new Perplexity({ apiKey });

    const completion = await client.chat.completions.create({
      model: body?.model ?? "sonar-pro",
      messages: messages as Array<{ role: ChatRole; content: string }> ,
      stream: false,
      temperature: body?.temperature,
      web_search_options: {
        search_type: body?.searchType ?? "pro",
        search_context_size: body?.searchContextSize,
      },
    });

    const cmp = completion as unknown as CompletionMinimal;
    const choices = Array.isArray(cmp?.choices) ? cmp.choices : [];
    const text = choices
      .map((c: { message?: { content?: string } }) => c?.message?.content)
      .filter(Boolean)
      .join("") || "";

    const payload = {
      text,
      usage: cmp?.usage ?? null,
      searchResults: cmp?.search_results ?? null,
      media: null,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err: unknown) {
    const message = err && typeof err === "object" && "message" in err
      ? String((err as { message?: string }).message)
      : "Proxy error";
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message }),
    };
  }
};

export default handler;


