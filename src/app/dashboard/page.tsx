import { redirect } from "next/navigation";

// Old test console route; the app lives at / now.
export default function Page() {
  redirect("/");
}
