import { redirect } from "next/navigation";
import { currentAccount, publicAccount } from "@/lib/session";
import { lastWeek } from "@/lib/drafts";
import Dashboard from "./dashboard";

// Per-user page: always rendered on request.
export const instant = false;

export default async function Page() {
  const a = await currentAccount();
  if (!a) redirect("/");
  return <Dashboard initial={publicAccount(a)} defaultPeriod={lastWeek()} />;
}
