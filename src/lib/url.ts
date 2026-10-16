/** Where the app runs (no trailing slash): GitHub redirects and unsubscribe links. */
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
