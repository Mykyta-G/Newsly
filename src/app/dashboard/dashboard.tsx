"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { publicAccount } from "@/lib/session";

type Me = ReturnType<typeof publicAccount>;
type Draft = NonNullable<Me["draft"]>;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Fel ${res.status}`);
  return body as T;
}

const card = "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";
const input = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const btn = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40";
const primary = `${btn} bg-indigo-600 text-white hover:bg-indigo-500`;
const secondary = `${btn} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

export default function Dashboard({ initial, defaultPeriod }: { initial: Me; defaultPeriod: { from: string; to: string } }) {
  const router = useRouter();
  const [me, setMe] = useState(initial);
  const [form, setForm] = useState({
    profileKey: initial.profileKey, companyName: initial.companyName, profileText: initial.profileText,
    brandColor: initial.brandColor, email: initial.email, manualNotes: initial.manualNotes,
    subscribers: initial.subscribers.join("\n"),
  });
  const [granted, setGranted] = useState<{ repos: string[]; installUrl: string; error?: string } | null>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [override, setOverride] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetch("/api/repos").then((r) => r.json()).then(setGranted).catch(() => {});
  }, []);

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label); setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const save = (patch: Partial<Me>, note = "Sparat.") =>
    run("save", async () => {
      const updated = await api<Me>("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
      setMe(updated);
      setForm((f) => ({ ...f, profileText: updated.profileText, companyName: updated.companyName, brandColor: updated.brandColor }));
      return note;
    });

  const emails = form.subscribers.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const draft = me.draft as Draft | null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Newsly</h1>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          @{me.login}
          <button className={secondary} onClick={() => api("/api/auth/logout", { method: "POST" }).then(() => router.push("/"))}>Logga ut</button>
        </div>
      </header>

      {msg && <p className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>{msg.text}</p>}

      <section className={card}>
        <h2 className="mb-3 font-semibold">1. Kundprofil</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Mall
            <select className={input} value={form.profileKey} onChange={(e) => { const profileKey = e.target.value as Me["profileKey"]; setForm({ ...form, profileKey }); if (profileKey !== "custom") save({ profileKey }, "Mallen är inläst."); }}>
              <option value="klyro">Klyro</option>
              <option value="simple-schedules">Simple Schedules</option>
              <option value="custom">Egen</option>
            </select>
          </label>
          <label className="text-sm">Företagsnamn<input className={input} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
          <label className="text-sm">Färg<input type="color" className={`${input} h-[38px] p-1`} value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} /></label>
        </div>
        <label className="mt-3 block text-sm">Profil (ton, läsare, avsändare, särskilda regler)
          <textarea className={`${input} h-48 font-mono text-xs`} value={form.profileText} onChange={(e) => setForm({ ...form, profileText: e.target.value })} />
        </label>
        <label className="mt-3 block text-sm">Din e-post för testmejl<input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <button className={`${primary} mt-3`} disabled={!!busy} onClick={() => save({ profileKey: form.profileKey, companyName: form.companyName, profileText: form.profileText, brandColor: form.brandColor, email: form.email })}>Spara profil</button>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">2. Underlag</h2>
        <div className="mb-3 flex gap-4 text-sm">
          <label><input type="radio" checked={me.source === "github"} onChange={() => save({ source: "github" })} /> Från GitHub</label>
          <label><input type="radio" checked={me.source === "manual"} onChange={() => save({ source: "manual" })} /> Jag skriver själv</label>
        </div>
        {me.source === "github" ? (
          <div className="space-y-2 text-sm">
            <p className="text-zinc-500">Newsly kan bara <b>läsa</b> commit-texter och datum, och bara i repon du har valt. Ingen kod läses, inget skrivs.</p>
            {granted?.repos.length ? granted.repos.map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input type="checkbox" checked={me.repos.includes(r)} onChange={(e) => save({ repos: e.target.checked ? [...me.repos, r] : me.repos.filter((x) => x !== r) }, e.target.checked ? `${r} kopplat.` : `${r} bortkopplat.`)} />
                {r}
              </label>
            )) : <p>{granted?.error ?? (granted ? "Inga repon har gett åtkomst ännu." : "Laddar…")}</p>}
            {granted && <a className="inline-block text-indigo-600 underline" href={granted.installUrl}>Välj vilka repon Newsly får läsa (eller ta bort åtkomst) på GitHub</a>}
          </div>
        ) : (
          <>
            <textarea className={`${input} h-40`} placeholder={"- Nu går det att exportera schemat till PDF\n- Krockar visas direkt när du flyttar en lektion"} value={form.manualNotes} onChange={(e) => setForm({ ...form, manualNotes: e.target.value })} />
            <button className={`${primary} mt-3`} disabled={!!busy} onClick={() => save({ manualNotes: form.manualNotes })}>Spara veckans punkter</button>
          </>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">3. Mottagare <span className="font-normal text-zinc-500">({me.subscribers.length} sparade)</span></h2>
        <textarea className={`${input} h-28`} placeholder="en e-post per rad" value={form.subscribers} onChange={(e) => setForm({ ...form, subscribers: e.target.value })} />
        <button className={`${primary} mt-3`} disabled={!!busy} onClick={() => save({ subscribers: emails }, `${emails.length} mottagare sparade.`)}>Spara mottagare</button>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">4. Veckans brev</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Från<input type="date" className={input} value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></label>
          <label className="text-sm">Till<input type="date" className={input} value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></label>
          <button className={primary} disabled={!!busy} onClick={() => run("draft", async () => {
            const d = await api<Draft>("/api/draft", { method: "POST", body: JSON.stringify(period) });
            setMe({ ...me, draft: d }); setOverride(false);
            return d.status === "godkänd" ? "Utkastet är klart och klarade granskningen." : "Utkastet klarade inte granskningen två gånger. Läs det noga.";
          })}>{busy === "draft" ? "Skriver och granskar… (upp till en minut)" : "Skapa utkast"}</button>
        </div>

        {draft && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${draft.status === "godkänd" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {draft.status === "godkänd" ? "Granskad och godkänd" : "Behöver manuell granskning"}
              </span>
              <span className="text-zinc-500">{draft.from} – {draft.to} · Ämne: <b>{draft.letter.subject}</b></span>
            </div>
            {draft.problems.length > 0 && (
              <ul className="list-disc rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {draft.problems.map((p, i) => <li key={i}><b>{p.typ}</b>: “{p.citat}” — {p.åtgärd}</li>)}
              </ul>
            )}
            <iframe title="Förhandsvisning" className="h-[640px] w-full rounded-lg border border-zinc-200 bg-white" srcDoc={draft.html} sandbox="" />
            <details className="text-sm"><summary className="cursor-pointer text-zinc-500">Visa underlaget som skickades till GPT</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-800">{draft.underlag}</pre></details>
            <div className="flex flex-wrap items-center gap-3">
              <button className={secondary} disabled={!!busy} onClick={() => run("test", async () => {
                const r = await api<{ to: string }>("/api/draft/test", { method: "POST" });
                setMe({ ...me, draft: { ...draft, testSentAt: new Date().toISOString() } });
                return `Testmejl skickat till ${r.to}.`;
              })}>Skicka testmejl till mig</button>
              {draft.status === "manuell" && (
                <label className="text-sm"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Jag har läst brevet och vill skicka ändå</label>
              )}
              <button className={primary} disabled={!!busy || !draft.testSentAt || me.subscribers.length === 0 || (draft.status === "manuell" && !override)}
                onClick={() => run("send", async () => {
                  const r = await api<{ sent: number }>("/api/draft/approve", { method: "POST", body: JSON.stringify({ createdAt: draft.createdAt, override }) });
                  setMe({ ...me, draft: null, approvedOnce: true });
                  return `Skickat till ${r.sent} mottagare.`;
                })}>
                Godkänn och skicka till {me.subscribers.length} mottagare
              </button>
            </div>
            {!draft.testSentAt && <p className="text-xs text-zinc-500">Skicka ett testmejl till dig själv först, sedan kan du godkänna.</p>}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Inställningar</h2>
        <label className={`flex items-center gap-2 text-sm ${me.approvedOnce ? "" : "opacity-50"}`}>
          <input type="checkbox" disabled={!me.approvedOnce || !!busy} checked={me.requireApproval} onChange={(e) => save({ requireApproval: e.target.checked })} />
          Jag vill godkänna varje brev innan det skickas
          {!me.approvedOnce && <span className="text-zinc-500">(krävs tills du har godkänt ditt första brev)</span>}
        </label>
        <div className="mt-4">
          {!confirmDelete ? (
            <button className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`} onClick={() => setConfirmDelete(true)}>Radera konto och koppla bort GitHub</button>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              Allt raderas och Newslys åtkomst till GitHub tas bort.
              <button className={`${btn} bg-red-600 text-white`} onClick={() => run("delete", async () => { await api("/api/me", { method: "DELETE" }); router.push("/"); })}>Ja, radera</button>
              <button className={secondary} onClick={() => setConfirmDelete(false)}>Avbryt</button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
