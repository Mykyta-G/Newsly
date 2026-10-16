export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The 7 days up to today — used for the very first letter right after connecting. */
export function lastSevenDays(now = new Date()) {
  return { from: ymd(new Date(now.getTime() - 6 * 864e5)), to: ymd(now) };
}

/** Last full Monday–Sunday week — used by the weekly job. */
export function lastWeek(now = new Date()) {
  const day = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day - 7));
  return { from: ymd(monday), to: ymd(new Date(monday.getTime() + 6 * 864e5)) };
}
