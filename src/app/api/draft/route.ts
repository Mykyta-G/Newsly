import { z } from "zod";
import { draftAndTest } from "@/lib/drafts";
import { currentAccount } from "@/lib/session";

export const maxDuration = 300; // up to three GPT calls

const Body = z.object({ from: z.iso.date(), to: z.iso.date() });

/** Write + review a fresh draft for the period and email it to the customer as a test. */
export async function POST(request: Request) {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Inte inloggad" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ange från- och till-datum." }, { status: 400 });
  try {
    return Response.json(await draftAndTest(a, parsed.data.from, parsed.data.to));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
