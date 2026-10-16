import Newsly from "./newsly";

// Reads ?error= from a failed GitHub login, so it's rendered per request.
export const instant = false;

export default async function Page({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  return <Newsly loginError={typeof error === "string" ? error : undefined} />;
}
