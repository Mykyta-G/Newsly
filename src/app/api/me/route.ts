import { after } from "next/server";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { deleteAccount, updateAccount } from "@/lib/db";
import { defaultProfile, draftAndTest, lastSevenDays } from "@/lib/drafts";
import { revokeGrant } from "@/lib/github";
import { PROFILES } from "@/lib/prompts";
import { currentAccount, endSession, publicAccount } from "@/lib/session";

export const maxDuration = 300; // the first letter is written in the background after a PATCH

const unauthorized = () => Response.json({ error: "Inte inloggad" }, { status: 401 });

export async function GET() {
  const a = await currentAccount();
  if (!a) return unauthorized();
  return Response.json({ ...publicAccount(a), effectiveProfile: a.profileText.trim() || defaultProfile(a.companyName) });
}

const Patch = z.object({
  email: z.union([z.email(), z.literal("")]),
  profileKey: z.enum(["klyro", "simple-schedules", "custom"]),
  companyName: z.string().max(100),
  profileText: z.string().max(5000),
  brandColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  source: z.enum(["github", "manual"]),
  repos: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/)).max(20),
  manualNotes: z.string().max(10000),
  subscribers: z.array(z.email()).max(5000),
  requireApproval: z.boolean(),
}).partial();

export async function PATCH(request: Request) {
  const a = await currentAccount();
  if (!a) return unauthorized();
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Ogiltiga värden" }, { status: 400 });
  const p = parsed.data;
  // Picking a preset fills in its profile text, name and colour.
  if (p.profileKey && p.profileKey !== "custom" && p.profileKey !== a.profileKey) {
    const preset = PROFILES[p.profileKey];
    p.profileText ??= preset.text;
    p.companyName ??= preset.companyName;
    p.brandColor ??= preset.brandColor;
  }
  // Skipping approval is only allowed once a letter has been approved by hand.
  if (p.requireApproval === false && !a.approvedOnce) p.requireApproval = true;
  if (p.subscribers) p.subscribers = [...new Set(p.subscribers.map((e) => e.toLowerCase()))];
  const updated = await updateAccount(a.id, (x) => void Object.assign(x, p));

  // First time there's something to write from → write the first letter (last 7 days) and email it as a test.
  const hasInput = updated.source === "github" ? updated.repos.length > 0 : updated.manualNotes.trim() !== "";
  const firstTime = !updated.draft && !updated.lastLetter && updated.job?.state !== "running";
  if (hasInput && firstTime && (p.repos || p.manualNotes || p.source)) {
    const { from, to } = lastSevenDays();
    after(() => draftAndTest(updated, from, to).catch(console.error));
    return Response.json({ ...publicAccount(updated), job: { state: "running", at: new Date().toISOString() } });
  }
  return Response.json(publicAccount(updated));
}

/** Disconnect the whole account: revoke GitHub access and delete everything stored. */
export async function DELETE() {
  const a = await currentAccount();
  if (!a) return unauthorized();
  if (a.tokenEnc) await revokeGrant(decrypt(a.tokenEnc)).catch(() => {});
  await deleteAccount(a.id);
  await endSession();
  return Response.json({ ok: true });
}
