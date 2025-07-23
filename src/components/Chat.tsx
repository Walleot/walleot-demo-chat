"use client";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import { PaymentDialog } from "./PaymentDialog";

export default function Chat() {
  const { messages, send, status, elicitation, setElicitation } = useChat();
  const [input, setInput] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput("");
    await send(text);
  }

  return (
    <div className="flex flex-col w-full max-w-md py-12 mx-auto px-4 space-y-4">
      <div className="flex flex-col space-y-3 pb-32">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-32">
            <h2 className="text-xl font-semibold mb-2">Welcome to the Walleot Demo</h2>
            <p className="text-sm max-w-md mx-auto">
              This is a demo of Walleot payments. You can try the MCP server, which generates images for 0.20 demo credits.  <br />
              Just ask it to generate an image - it will first request a payment (in demo credits), then create the image.
            </p>
          </div>
        ) : messages.map((m, i) => (
          <div
            key={`msg-${i}`}
            className={`whitespace-pre-wrap p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-100 text-left' : 'bg-gray-100 text-left'
              }`}
          >
            {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
            {m.type === 'image' &&
                <img src={`data:image/png;base64, ${m.data}`} className="min-w-64"/>
            }
          </div>
        ))}
        {status === 'processing' && <div className="mt-2 w-full flex justify-start">
          <div className="animate-pulse h-3 w-3 bg-blue-400 rounded-full mx-1" />
          <div className="animate-pulse h-3 w-3 bg-blue-400 rounded-full mx-1 delay-75" />
          <div className="animate-pulse h-3 w-3 bg-blue-400 rounded-full mx-1 delay-150" />
        </div>}
      </div>

      <form
        onSubmit={onSubmit}
        className="fixed bottom-0 w-full max-w-md mb-4 px-4 bg-white p-4 rounded-sm"
      >
        <div className="flex items-center border border-gray-300 rounded-lg shadow-md overflow-hidden">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={status !== 'ready'}
            placeholder="Say something..."
            className="flex-1 px-3 py-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status !== 'ready'}
            className="bg-blue-500 text-white px-4 py-2 disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </form>

      <PaymentDialog elicitation={elicitation} setElicitation={setElicitation} />
    </div>
  );
}