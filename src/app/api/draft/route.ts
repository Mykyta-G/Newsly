import { z } from "zod";
import { draftAndTest } from "@/lib/drafts";
import { currentAccount } from "@/lib/session";

export const maxDuration = 300; // up to three GPT calls

const Body = z.object({ from: z.iso.date(), to: z.iso.date() });

/** Write + review a fresh draft for the period (replaces any unsent draft). No email; the UI has a test button. */
export async function POST(request: Request) {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Not logged in" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick a from and to date." }, { status: 400 });
  try {
    return Response.json(await draftAndTest(a, parsed.data.from, parsed.data.to, false));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
