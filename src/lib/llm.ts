// src/lib/llm.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type ToolDesc = any;

type FnArgsBuffer = {
  name?: string;
  chunks: string[];
};
const fnArgsBuffers = new Map<string, FnArgsBuffer>();

function getCallKey(e: any): string {
  return (
    e.call_id ||
    e.id ||
    e.tool_call_id ||
    e.item_id ||
    // fallback single-call key
    "default"
  );
}

export interface RunStreamOpts {
  messages: any;                    // array of messages in Responses API format
  tools?: ToolDesc[];               // tools in FLAT format: { type: "function", name, description, parameters }
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolEvent: any) => Promise<void> | void; // will receive function_call_arguments.* events
}

/**
 * Streaming model run using the Responses Streaming API.
 * Returns the final response object (event.response) after "response.completed".
 */
export async function runLLMStream({
  messages,
  tools = [],
  onTextDelta,
  onToolCall,
}: RunStreamOpts) {
  const stream = await openai.responses.stream({
    model: "gpt-4o-mini-2024-07-18",
    input: messages,
    tools,
    tool_choice: "auto",
  });

  let finalResponse: any = null;

  for await (const event of stream) {

    // Use loose guards to satisfy TS and support v5 event names
    const type = (event as any).type as string;

    // text chunks
    if (type === "response.output_text.delta") {
      onTextDelta?.((event as any).delta);
      continue;
    }
    if (type === "response.output_text.done") {
      continue;
    }

    if (type === "response.output_item.added" && (event as any).item?.type === "function_call") {
      const item = (event as any).item;
      const key = item.id || getCallKey(event);
      const buf = fnArgsBuffers.get(key) ?? { chunks: [] };
      if (item.name && !buf.name) buf.name = item.name;
      fnArgsBuffers.set(key, buf);
      continue;
    }

    // function call args (v5 renamed from tool_call)
    if (type === "response.function_call_arguments.delta") {
      const key = getCallKey(event);
      const buf = fnArgsBuffers.get(key) ?? { chunks: [] };
      if ((event as any).name && !buf.name) buf.name = (event as any).name;
      buf.chunks.push((event as any).delta ?? "");
      fnArgsBuffers.set(key, buf);
      continue;
    }

    if (type === "response.function_call_arguments.done") {
      const key = getCallKey(event);
      const buf = fnArgsBuffers.get(key);
      const fullArgs =
        (event as any).arguments ??
        (buf ? buf.chunks.join("") : "");
      const name =
        (event as any).name ??
        buf?.name ??
        (event as any).function_call?.name ??
        "unknown_function";

      await onToolCall?.({
        ...event,
        name,
        arguments: fullArgs,
      });

      fnArgsBuffers.delete(key);
      continue;
    }

    // final completion
    if (type === "response.completed") {
      finalResponse = (event as any).response;
      continue;
    }

    // ignore everything else (audio, reasoning, etc.)
    // console.debug("other event:", type, event);
  }

  return finalResponse;
}
