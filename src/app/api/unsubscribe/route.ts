import { safeEqual, sign } from "@/lib/crypto";
import { getAccount, updateAccount } from "@/lib/db";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const a = q.get("a") ?? "", e = q.get("e") ?? "", s = q.get("s") ?? "";
  const ok = Boolean(a && e && safeEqual(s, sign(`${a}:${e}`)));
  if (ok && (await getAccount(a))) await updateAccount(a, (x) => void (x.subscribers = x.subscribers.filter((m) => m !== e.toLowerCase())));
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center">${ok ? "Du får inga fler brev." : "Länken fungerar inte."}</body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
