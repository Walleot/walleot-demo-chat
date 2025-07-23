import { NextRequest } from "next/server";
import { getMcpClient } from "@/lib/mcpClient";
import { runLLMStream } from "@/lib/llm";
import { ReadableStream } from "stream/web";
import { waitForUserInput } from "@/lib/elicitation";

const MAX_MESSAGES = 6;
const MAX_MESSAGE_LENGTH = 200;

const systemPrompt = {
    role: "system",
    content: `You are a demo bot designed to showcase how Walleot payments work with MCP services. Your primary function is to generate images using your tools. Each image generation requires a payment in demo credits — no real money will be spent. If the user talks about anything else, politely guide them back to describing the image they want you to generate.`,
};

export async function POST(req: NextRequest) {
    const { messages: incomingMessages } = await req.json();
    const trimmedMessages = [
        systemPrompt,
        ...(incomingMessages ?? [])
            .slice(-MAX_MESSAGES)
            .map((msg: any) => ({
                ...msg,
                content: typeof msg.content === "string"
                    ? msg.content.slice(0, MAX_MESSAGE_LENGTH)
                    : msg.content,
            })),
    ];
    const encoder = new TextEncoder();
    let client: any;

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
                    client = await getMcpClient({
                        elicitationHandler: async (req) => {
                            const messageText = req.params.message || 'Payment required'

                            // Send elicitation event to client
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
                                return { action: "accept", content: userResponse.data };
                            } else {
                                return { action: userResponse.action };
                            }
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
                    // console.log("tools",toolsForOpenAI)


                    await runLLMStream({
                        messages: trimmedMessages,
                        tools: toolsForOpenAI,
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

                            const result = await client.callTool({ name, arguments: parsedArgs });

                            safeEnqueue(`data: ${JSON.stringify({ toolResult: result })}\n\n`);
                            //trimmedMessages.push({ role: "tool", name, content: JSON.stringify(result) });
                        },
                    });

                    // after the stream ends:
                    safeEnqueue(`data: ${JSON.stringify({ done: true })}\n\n`);

                    controller.close();
                    client.close();
                    closed = true;
                    clearInterval(heartbeat);
                } catch (e: any) {
                    console.error(e);
                    safeEnqueue(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
                    controller.close();
                    client.close();
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
