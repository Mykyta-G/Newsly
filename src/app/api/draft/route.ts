import { z } from "zod";
import { draftAndTest } from "@/lib/drafts";
import { currentAccount } from "@/lib/session";

export const maxDuration = 300; // up to three GPT calls

const Body = z.object({ from: z.iso.date(), to: z.iso.date(), prompt: z.string().max(1000).optional() });

/** Write + review a fresh draft for the period, steered by the compose-chat prompt (replaces any unsent draft). No email. */
export async function POST(request: Request) {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Not logged in" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (parsed.success && parsed.data.from > parsed.data.to) return Response.json({ error: "The start date is after the end date." }, { status: 400 });
  if (!parsed.success) return Response.json({ error: "Pick a from and to date." }, { status: 400 });
  try {
    return Response.json(await draftAndTest(a, parsed.data.from, parsed.data.to, false, parsed.data.prompt));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
