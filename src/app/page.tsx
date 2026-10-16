export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">Newsly</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Ni släpper förbättringar varje vecka. Era kunder hör aldrig om dem. Newsly läser vad ni har gjort och skriver ett
        kort veckobrev som kunderna faktiskt förstår.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
        <li>Logga in med GitHub och välj repon (bara läsrätt), eller skriv veckans nyheter själv</li>
        <li>Newsly skriver brevet och granskar det mot påhitt och tekniskt språk</li>
        <li>Du får ett testmejl, godkänner, och det går ut till dina kunder</li>
      </ol>
      <a href="/api/auth/login" className="w-fit rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-black">
        Logga in med GitHub
      </a>
    </main>
  );
}
