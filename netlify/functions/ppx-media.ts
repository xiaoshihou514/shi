import type { Handler } from "@netlify/functions";

type ChatRole = "system" | "user" | "assistant" | "tool";
type ChatMessage = { role: ChatRole; content: string };

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
      mediaOverrides?: Record<string, unknown>;
      model?: string;
      temperature?: number;
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

    const payload = {
      model: body?.model ?? "sonar-pro",
      media_response: { overrides: body?.mediaOverrides ?? {} },
      temperature: body?.temperature,
      messages,
    };

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: await response.text(),
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


