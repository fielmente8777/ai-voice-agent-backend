// ============================================================
// SARVAM LLM (chat completions, streamed)
// messages in -> reply text out, piece by piece via onDelta(), so the
// agent can start SPEAKING the first sentence while the rest is written.
// Throws on failure.
//
// response_format json_object is REQUIRED: without it Sarvam returns
// content:null whenever the model answers with a JSON object (which is
// every time it wants to send something on WhatsApp).
// ============================================================

import config from "../config/env.js";

const { apiKey } = config.sarvam;
const { url, model, maxTokens, temperature, timeoutMs } = config.sarvam.llm;

export async function streamChat(messages, { onDelta, signal } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      reasoning_effort: null, // no thinking mode — lower latency on a live call
      response_format: { type: "json_object" },
      stream: true,
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!res.ok) {
    throw new Error(`Sarvam chat HTTP ${res.status}: ${await res.text()}`);
  }

  // Server-sent events: lines of `data: {json}` ending with `data: [DONE]`.
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });

    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let delta;
      try {
        delta = JSON.parse(data).choices?.[0]?.delta?.content;
      } catch {
        continue; // keep-alive or partial line
      }

      if (delta) {
        content += delta;
        onDelta?.(delta);
      }
    }
  }

  return content.trim();
}
