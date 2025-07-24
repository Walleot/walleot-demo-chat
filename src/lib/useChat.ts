"use client";

import { ChatMessage, ToolResult } from "@/types/chat";
import { PaymentElicitation } from "@/types/elicitattion";
import { useState, useRef } from "react";

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<"ready" | "processing" | "error">("ready");
    const [elicitation, setElicitation] = useState<PaymentElicitation | null>(null);
    const assistantBufferRef = useRef<string>("");
    const controllerRef = useRef<AbortController | null>(null);
    const sseBufferRef = useRef<string>("");

    async function send(text: string) {
        setStatus("processing");
        const newMsg = { role: "user", content: text };
        setMessages((m) => [...m, newMsg]);

        controllerRef.current?.abort();
        controllerRef.current = new AbortController();

        // reset buffer for new assistant message
        assistantBufferRef.current = "";

        let res;
        try {
            res = await fetch("/api/chat", {
                method: "POST",
                body: JSON.stringify({ messages: [...messages.map(om=>({role:om.role,content:om.content})), newMsg] }),
                headers: { "Content-Type": "application/json" },
                signal: controllerRef.current.signal,
            });
        } catch {
            setStatus("error");
            return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        // Helper to process a single SSE event block
        const processEvent = (raw: string) => {
            if (!raw.startsWith("data:")) return;
            const jsonStr = raw.slice(5).trim();
            if (!jsonStr) return;
            let payload: any;
            try {
                payload = JSON.parse(jsonStr);
            } catch {
                return;
            }


            if (payload.elicitation) {
                setElicitation(payload.elicitation);
                return;
            }

            // tool result received
            if (payload.toolResult) {
                const newmessages = payload.toolResult?.content?.map((c: ToolResult) => ({
                    role: "assistant",
                    type: c.type,
                    data: c.data,
                    content: c.content || (c as any).text,
                }));
                setMessages((m) => [...m, ...newmessages]);
                return;
            }

            // delta text
            if (payload.delta !== undefined) {
                assistantBufferRef.current += payload.delta;
                setMessages((m) => {
                    const last = m[m.length - 1];
                    if (last && last.role === "assistant" && (last as any)._streaming) {
                        const updated = [...m];
                        updated[updated.length - 1] = {
                            ...last,
                            content: assistantBufferRef.current,
                            _streaming: true,
                        } as any;
                        return updated;
                    }
                    return [
                        ...m,
                        { role: "assistant", content: assistantBufferRef.current, _streaming: true } as any,
                    ];
                });
                return;
            }

            // completion
            if (payload.done) {
                const lbuf = assistantBufferRef.current;
                setMessages((m) => {
                    const updated = [...m];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: (last as any).content || lbuf,
                            _streaming: undefined,
                        } as any;
                    }
                    return updated;
                });
                setStatus("ready");
                assistantBufferRef.current = "";
                return;
            }

            // any other service-related data
            setMessages((m) => [...m, { role: "assistant", content: payload } as any]);
        };

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                // flush whatever is left in the buffer as final complete events
                if (sseBufferRef.current) {
                    const leftover = sseBufferRef.current.split("\n\n").filter(Boolean);
                    for (const raw of leftover) {
                        processEvent(raw);
                    }
                    sseBufferRef.current = "";
                }
                break;
            }

            const chunk = decoder.decode(value, { stream: true });

            // accumulate and only parse full SSE frames
            sseBufferRef.current += chunk;

            // split by double-newline, last piece might be incomplete, keep it in the buffer
            const parts = sseBufferRef.current.split("\n\n");
            sseBufferRef.current = parts.pop() ?? "";

            for (const raw of parts) {
                processEvent(raw);
            }
        }
    }

    return { messages, send, elicitation, setElicitation, status };
}