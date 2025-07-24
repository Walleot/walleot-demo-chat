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

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            // parse SSE chunks like 'data: {...}\n\n'
            const lines = chunk.split("\n\n").filter(Boolean);
            for (const raw of lines) {
                if (!raw.startsWith("data:")) continue;
                const jsonStr = raw.slice(5).trim();
                if (!jsonStr) continue;
                let payload;
                try {
                    payload = JSON.parse(jsonStr);
                } catch {
                    continue;
                }

                console.log("payload", payload)

                if (payload.elicitation) {
                    setElicitation(payload.elicitation);
                    console.log("setting elicitation",payload.elicitation)
                    continue;
                }

                // tool result received
                if (payload.toolResult) {
                    console.log("payload.toolResult",payload.toolResult)
                    const newmessages=payload.toolResult?.content?.map((c:ToolResult)=>({role:"assistant",type:c.type, data: c.data, content:c.content || c.text}))
                    console.log("new mess",newmessages)
                    setMessages((m) => [...m, ...newmessages]);
                    continue;
                }

                // delta text
                if (payload.delta !== undefined) {
                    assistantBufferRef.current += payload.delta;
                    setMessages((m) => {
                        const last = m[m.length - 1];
                        if (last && last.role === "assistant" && last._streaming) {
                            const updated = [...m];
                            updated[updated.length - 1] = {
                                ...last,
                                content: assistantBufferRef.current,
                                _streaming: true,
                            };
                            return updated;
                        }
                        return [
                            ...m,
                            { role: "assistant", content: assistantBufferRef.current, _streaming: true },
                        ];
                    });
                    continue;
                }

                // completion
                if (payload.done) {
                    const lbuf=assistantBufferRef.current;
                    setMessages((m) => {
                        const updated = [...m];
                        const last = updated[updated.length - 1];
                        if (last && last.role === "assistant") {
                            updated[updated.length - 1] = { ...updated[updated.length - 1], content: last.content || lbuf, _streaming: undefined};
                        }
                        return updated;
                    });
                    setStatus("ready");
                    assistantBufferRef.current = "";
                    continue;
                }

                // any other service-related data
                setMessages((m) => [...m, { role: "assistant", content: payload }]);
            }
        }
    }

    return { messages, send, elicitation, setElicitation, status };
}