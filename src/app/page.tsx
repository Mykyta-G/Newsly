export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">Newsly</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        You ship every week. Your customers never hear about it. Newsly reads your GitHub activity and
        turns it into a newsletter they actually understand.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
        <li>Connect a repo</li>
        <li>Newsly drafts the update from commits, PRs and releases</li>
        <li>Review it, hit send</li>
      </ol>
    </main>
  );
}
