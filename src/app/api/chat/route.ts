import { NextRequest } from "next/server";
import { getMcpClient } from "@/lib/mcpClient";
import { runLLMStream } from "@/lib/llm";
import { ReadableStream } from "stream/web";
import { waitForUserInput } from "@/lib/elicitation";
import { ChatMessage } from "@/types/chat";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ElicitRequest, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { Tool } from "openai/resources/responses/responses.mjs";

const MAX_MESSAGES = 6;
const MAX_MESSAGE_LENGTH = 200;
const FALLBACK_GREETING = "Hello, this is the Walleot demo. Tell me what you want me to draw for you.";
const FALLBACK_FINISHED = "Demo finished. Please start a new chat or refresh the page to try the demo again.";

const systemPrompt = {
    role: "system",
    content: `You are a demo bot designed to showcase how Walleot payments work with MCP services. Your primary function is to generate images using your tools. Each image generation requires a payment in demo credits — no real money will be spent. If the user talks about anything else, politely guide them back to describing the image they want you to generate.`,
};

export async function POST(req: NextRequest) {
    const { messages: incomingMessages } = await req.json();
    const userMessages = (incomingMessages ?? []).filter((msg: ChatMessage) => msg.role === "user");
    const trimmedMessages = [
        systemPrompt,
        ...(incomingMessages ?? [])
            .slice(-MAX_MESSAGES)
            .map((msg: ChatMessage) => ({
                ...msg,
                content: typeof msg.content === "string"
                    ? msg.content.slice(0, MAX_MESSAGE_LENGTH)
                    : msg.content,
            })),
    ];
    const encoder = new TextEncoder();
    let client: Client | undefined;

    const stream = new ReadableStream({
        start(controller) {
            let closed = false;
            const safeEnqueue = (str: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(str));
                } catch {
                    // ignore enqueue after close
                }
            };

            (async () => {
                const heartbeat = setInterval(() => {
                    if (closed) {
                        clearInterval(heartbeat);
                        return;
                    }
                    safeEnqueue(": hb\n\n");
                }, 15000);

                try {
                    const elicitationHandler = async (req: ElicitRequest): Promise<ElicitResult> => {
                        const messageText = req.params.message || 'Payment required'

                        safeEnqueue(
                            `data: ${JSON.stringify({
                                elicitation: {
                                    type: "payment",
                                    url: req.params.paymentUrl,
                                    payment_id: req.params.paymentId,
                                    message: messageText,
                                },
                            })}\n\n`
                        );

                        const userResponse: any = await waitForUserInput(req.params.paymentId as string);
                        if (userResponse.action === "accept") {
                            return { action: "accept", content: userResponse.data ?? {} };
                        } else if (userResponse.action === "decline") {
                            return { action: "decline" };
                        } else {
                            return { action: "cancel" };
                        }
                    };

                    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

                    if (!hasOpenAIKey) {
                        if (userMessages.length === 1) {
                            safeEnqueue(`data: ${JSON.stringify({ delta: FALLBACK_GREETING })}\n\n`);
                            safeEnqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
                            controller.close();
                            closed = true;
                            clearInterval(heartbeat);
                            return;
                        }

                        if (userMessages.length === 2) {
                            client = await getMcpClient({ elicitationHandler });
                            const prompt = String(userMessages[1]?.content ?? "").slice(0, MAX_MESSAGE_LENGTH);
                            const result = await client.callTool({ name: "generate", arguments: { prompt } });
                            safeEnqueue(`data: ${JSON.stringify({ toolResult: result })}\n\n`);
                            safeEnqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
                            controller.close();
                            await client.close();
                            closed = true;
                            clearInterval(heartbeat);
                            return;
                        }

                        safeEnqueue(`data: ${JSON.stringify({ delta: FALLBACK_FINISHED })}\n\n`);
                        safeEnqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
                        controller.close();
                        closed = true;
                        clearInterval(heartbeat);
                        return;
                    }

                    client = await getMcpClient({
                        elicitationHandler: async (req) => {
                            return elicitationHandler(req);
                        }
                    });
                    const availableTools = await client.listTools();

                    // Convert MCP tools to OpenAI tool format (flattened for Responses API)
                    const toolsForOpenAI = (availableTools.tools ?? []).map((t: any) => ({
                        type: "function",
                        name: t.name,
                        description: t.description,
                        parameters: t.inputSchema,
                    }));


                    await runLLMStream({
                        messages: trimmedMessages,
                        tools: toolsForOpenAI as Tool[],
                        onTextDelta: (delta) => {
                            safeEnqueue(`data: ${JSON.stringify({ delta })}\n\n`);
                        },
                        onToolCall: async (toolEvent) => {
                            // toolEvent contains name/arguments (Responses API v5)
                            const call = toolEvent as any;
                            const name = call.name as string | undefined;

                            const rawArgs = call.arguments ?? "";

                            let parsedArgs: any = rawArgs;
                            if (typeof rawArgs === "string") {
                                try {
                                    parsedArgs = rawArgs.length ? JSON.parse(rawArgs) : {};
                                } catch (e) {
                                    console.error("Failed to JSON.parse tool args", rawArgs, e);
                                    parsedArgs = {};
                                }
                            }

                            const result = await client!.callTool({ name:name as string, arguments: parsedArgs });

                            safeEnqueue(`data: ${JSON.stringify({ toolResult: result })}\n\n`);
                            //trimmedMessages.push({ role: "tool", name, content: JSON.stringify(result) });
                        },
                    });

                    // after the stream ends:
                    safeEnqueue(`data: ${JSON.stringify({ done: true })}\n\n`);

                    controller.close();
                    await client.close();
                    closed = true;
                    clearInterval(heartbeat);
                } catch (e: any) {
                    console.error(e);
                    safeEnqueue(`data: ${JSON.stringify({ error: e.message })}\n\n`);
                    controller.close();
                    await client?.close();
                    closed = true;
                    clearInterval(heartbeat);
                } finally {
                    closed = true;
                    clearInterval(heartbeat);
                }
            })();
        },
    });

    return new Response(stream as any, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
