export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: string;
  content: string;
  name?: string; 
  type?: string;
  data?:string;
  _streaming?:boolean;
}

export interface ToolResult {
   type?: string; 
   data?: string; 
   content?: string; 
   text?: string; 
   name?: string; 
   arguments?: any
}

export interface CallEvent {
  call_id?: string;
  id?: string;
  tool_call_id?: string;
  item_id?: string;
}


export type LLMEvent = {
  type: string;
  delta?: string;
  item?: { type: string; id?: string; name?: string };
  arguments?: string;
  name?: string;
  function_call?: { name: string };
  response?: unknown;
  call_id?: string;
  id?: string;
  tool_call_id?: string;
  item_id?: string;
};