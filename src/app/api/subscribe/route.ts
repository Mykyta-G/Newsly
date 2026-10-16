import { z } from "zod";
import { addSubscriber } from "@/lib/store";

// POST /api/subscribe { email }
export async function POST(request: Request) {
  const parsed = z.object({ email: z.email() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "valid email required" }, { status: 400 });
  const count = await addSubscriber(parsed.data.email);
  return Response.json({ ok: true, count });
}
