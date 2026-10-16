import { sendNewsletter } from "@/lib/email";
import { getSubscribers } from "@/lib/store";

// POST /api/newsletter/send { subject, html } → sends the (reviewed) draft to all subscribers
export async function POST(request: Request) {
  const { subject, html } = await request.json();
  if (!subject || !html) return Response.json({ error: "subject and html required" }, { status: 400 });
  return Response.json(await sendNewsletter({ subject, html }, await getSubscribers()));
}
