import { answerUserInput } from "@/lib/elicitation";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { payment_id, data } = await req.json();
  const ok = answerUserInput(payment_id, data);
  return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 404 });
}