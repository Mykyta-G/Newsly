import { cookies } from "next/headers";
import { randomId } from "@/lib/crypto";
import { authorizeUrl } from "@/lib/github";

export async function GET() {
  const state = randomId();
  (await cookies()).set("newsly_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return Response.redirect(authorizeUrl(state));
}
