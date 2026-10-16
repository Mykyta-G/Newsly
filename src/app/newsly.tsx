"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

// Ludvig's Claude Design screen ("Newsly", Broadsheet design system), wired to the real API.
// Markup and inline styles follow the design file one to one; the Settings dialog is the only addition.

type Letter = {
  subject: string; preheader: string; greeting: string; intro: string;
  sections: { heading: string; body: string }[]; closing: string; signature: string;
};
type Item = {
  id: string; title: string; period: string; from: string; to: string;
  status: "approved" | "needs_review" | "sent"; sentAt?: string; recipients: number; testSentAt?: string | null;
  problems: { typ: string; citat: string; åtgärd: string }[]; letter: Letter; source: string[];
};
type Me = {
  id: string; login: string; email: string; companyName: string; repos: string[]; subscribers: string[];
  requireApproval: boolean; approvedOnce: boolean; job?: { state: "running" | "failed"; error?: string } | null;
};
type Repo = { fullName: string; private: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Error ${res.status}`), { status: res.status });
  return body as T;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const SUGGESTIONS = ["A letter that sums up everything since 1/10", "A bigger summary of the last month for our biggest customers", "A short thank-you note about what got faster this quarter"];
const STATUS = {
  sent: { label: "Sent", tag: "tag tag-neutral", dot: "var(--color-neutral-500)" },
  approved: { label: "Approved draft", tag: "tag tag-accent", dot: "var(--color-accent-400)" },
  needs_review: { label: "Needs review", tag: "tag tag-accent-2", dot: "var(--color-accent-2-400)" },
};
const muted = { color: "var(--color-neutral-400)" };

export default function Newsly({ loginError }: { loginError?: string }) {
  const [view, setView] = useState<"loading" | "welcome" | "app">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [letters, setLetters] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState(false);
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, ls] = await Promise.all([api<Me>("/api/me"), api<Item[]>("/api/letters")]);
      setMe(m);
      setLetters(ls);
      setSel((s) => (s && ls.some((l) => l.id === s) ? s : ls[0]?.id ?? null));
      setView("app");
      return m;
    } catch (e) {
      if ((e as { status?: number }).status === 401) setView("welcome");
      else setError((e as Error).message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (location.search) history.replaceState(null, "", "/");
    load().then((m) => { if (m && m.repos.length === 0) setSettingsOpen(true); });
  }, [load]);

  // The first letter is written in the background after repos are picked: check back until it's there.
  const running = me?.job?.state === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function call(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }

  const q = query.trim().toLowerCase();
  const list = letters.filter((l) => !q || l.title.toLowerCase().includes(q));
  const cur = letters.find((l) => l.id === sel) ?? letters[0] ?? null;
  const isGenerating = running;
  const hasLetter = !isGenerating && !!cur;
  const isSent = cur?.status === "sent";
  const review = cur?.status === "needs_review";
  const tested = !!cur?.testSentAt;
  const requireApproval = me?.requireApproval ?? true;
  const showActions = !!cur && !isSent && !isGenerating;
  const approveDisabled = busy || (requireApproval && !tested) || (me?.subscribers.length ?? 0) === 0;
  const testLabel = !me?.email ? "Add your email in Settings" : tested ? `Test sent to ${me.email} — send again` : `Send test email to ${me.email}`;
  const approveLabel = review ? "Override and send" : "Approve and send";
  const approveTitle = (me?.subscribers.length ?? 0) === 0 ? "Add subscribers in Settings first."
    : requireApproval && !tested ? "Send yourself a test email first, look it over, then approve."
    : `Goes out as one email to each of ${me?.subscribers.length} subscribers.`;

  // Compose: default period is the last 7 days, up to today.
  const openNew = () => {
    setFrom(ymd(new Date(Date.now() - 6 * 864e5)));
    setTo(ymd(new Date()));
    setChat([]); setPrompt(""); setCompose(true);
  };

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    // A date in the prompt (2026-10-01 or 1/10, day/month) overrides the start.
    let start = from;
    const iso = text.match(/\d{4}-\d{2}-\d{2}/), dm = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (iso) start = iso[0];
    else if (dm) start = `${to.slice(0, 4)}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    setChat((c) => [...c, { role: "user", text }, { role: "ai", text: `Reading your work from ${start} to ${to} and writing the letter. This can take up to a minute…` }]);
    setPrompt(""); setFrom(start); setBusy(true); setError(null);
    try {
      const d = await api<{ createdAt: string }>("/api/draft", { method: "POST", body: JSON.stringify({ from: start, to, prompt: text }) });
      await load();
      setSel(d.createdAt); setCompose(false); setChat([]);
    } catch (e) {
      setChat((c) => [...c, { role: "ai", text: (e as Error).message || "Something went wrong. Try again." }]);
    } finally { setBusy(false); }
  }

  const sendTest = () => call(async () => { await api("/api/draft/test", { method: "POST" }); await load(); });
  const approve = () => call(async () => {
    if (!cur) return;
    await api("/api/draft/approve", { method: "POST", body: JSON.stringify({ createdAt: cur.id, override: review }) });
    await load();
  });
  const logout = () => { fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); setView("welcome"); setMe(null); setLetters([]); };

  if (view === "loading") return <div style={{ height: "100vh", background: "#141211" }} />;

  return (
    <div style={{ "--color-bg": "#141211", "--color-surface": "#1e1b1a", "--color-text": "#ece9e8", "--color-divider": "rgba(236,233,232,0.16)", "--color-accent": "#2a9fc4", height: "100vh", width: "100%", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", overflow: "hidden", position: "relative" } as CSSProperties}>

      {view === "welcome" && (
        <div style={{ height: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr)", alignContent: "center", padding: "0 clamp(24px,8vw,140px)", gap: "var(--space-8)" }}>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: 10 }}><Logo size={34} />Newsly</div>
          <div style={{ maxWidth: 880 }}>
            <h1 style={{ fontSize: "clamp(44px,6.4vw,92px)", lineHeight: 1.02, margin: "0 0 var(--space-6)" }}>Your customers should hear what you shipped.</h1>
            <p style={{ fontSize: 22, lineHeight: 1.5, maxWidth: 620, margin: "0 0 var(--space-8)", color: "var(--color-neutral-400)" }}>Newsly reads this week’s work on GitHub and sends a short, plain-language letter about what customers gain. No jargon. Nothing made up.</p>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
              <a href="/api/auth/login" className="btn btn-primary" style={{ fontSize: 17, padding: "14px 26px", minHeight: 52 }}>Log in with GitHub</a>
              <span style={{ fontSize: 14, color: "var(--color-neutral-400)" }}>Read-only · only repos you pick · commit messages and dates, never code</span>
            </div>
            {loginError && <p style={{ marginTop: "var(--space-4)", fontSize: 15, color: "var(--color-accent-2-400)" }}>{loginError}</p>}
          </div>
        </div>
      )}

      {view === "app" && me && (
        <div style={{ height: "100%", display: "grid", gridTemplateColumns: "304px minmax(0,1fr)" }}>

          <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#0f0d0c", padding: "var(--space-4) var(--space-3) 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--space-2) var(--space-4)" }}>
              <span style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--font-heading)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}><Logo size={36} />Newsly</span>
              <button className="btn btn-ghost btn-icon" title="Settings" style={{ color: "var(--color-neutral-400)" }} onClick={() => setSettingsOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8l1.6 2.3 2.8-.5.9 2.7 2.6 1.2-.6 2.8 1.8 2.2-1.8 2.2.6 2.8-2.6 1.2-.9 2.7-2.8-.5L12 21.2l-1.6-2.3-2.8.5-.9-2.7-2.6-1.2.6-2.8L2.9 10.5l1.8-2.2-.6-2.8 2.6-1.2.9-2.7 2.8.5z" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "0 12px", minHeight: 40, color: "var(--color-neutral-400)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" strokeLinecap="round" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search letters" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: 0, color: "var(--color-text)", font: "inherit", fontSize: 15 }} />
            </label>
            <button className="btn btn-secondary" style={{ margin: "var(--space-3) 0 var(--space-4)", justifyContent: "flex-start", gap: 10, minHeight: 42, fontSize: 15 }} onClick={openNew} disabled={isGenerating || me.repos.length === 0}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>New letter
            </button>
            <div style={{ fontSize: 13, color: "var(--color-neutral-500)", padding: "0 var(--space-2) var(--space-2)", letterSpacing: "0.04em" }}>Letters</div>
            <nav style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {list.map((l) => (
                <button key={l.id} onClick={() => { setSel(l.id); setCompose(false); }} style={{ display: "flex", flexDirection: "column", gap: 5, textAlign: "left", cursor: "pointer", border: 0, borderRadius: "var(--radius-md)", padding: "10px 12px", color: "var(--color-text)", background: l.id === cur?.id ? "var(--color-surface)" : "transparent" }}>
                  <span style={{ fontSize: 16, lineHeight: 1.25 }}>{l.title}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-neutral-400)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: STATUS[l.status].dot }} />{STATUS[l.status].label} · {l.period}
                  </span>
                </button>
              ))}
              {list.length === 0 && <div style={{ padding: "var(--space-3)", fontSize: 14, color: "var(--color-neutral-500)" }}>{letters.length ? "No letters match." : "No letters yet."}</div>}
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "var(--space-3) var(--space-2)", margin: "0 calc(-1*var(--space-1))" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--color-accent-2-800)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 600 }}>{me.login.slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}><div style={{ fontSize: 15 }}>{me.login}</div><div style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{me.companyName}</div></div>
              <button className="btn btn-ghost" style={{ color: "var(--color-neutral-400)", fontSize: 13 }} onClick={logout}>Log out</button>
            </div>
          </aside>

          <main style={{ position: "relative", display: "flex", flexWrap: "wrap", alignContent: "flex-start", overflow: "auto", minHeight: 0, minWidth: 0 }}>
            <section style={{ flex: "1 1 480px", padding: "88px clamp(16px,4vw,64px) 64px", minWidth: 0, boxSizing: "border-box" }}>
              {error && <div style={{ maxWidth: 660, margin: "0 auto var(--space-4)", fontSize: 15, color: "var(--color-accent-2-400)" }}>{error}</div>}
              {me.job?.state === "failed" && !isGenerating && !cur && <div style={{ maxWidth: 660, margin: "0 auto var(--space-4)", fontSize: 15, color: "var(--color-accent-2-400)" }}>The first letter could not be written: {me.job.error}</div>}
              {isGenerating && (
                <div style={{ maxWidth: 640, margin: "18vh auto 0", textAlign: "left" }}>
                  <h2 style={{ fontSize: 34, margin: "0 0 var(--space-3)" }}>Writing the letter…</h2>
                  <p style={{ fontSize: 17, color: "var(--color-neutral-400)", margin: 0 }}>Reading commit messages, drafting, then a second pass checks for tech words and made-up claims. Up to a minute.</p>
                </div>
              )}
              {!isGenerating && !cur && (
                <div style={{ maxWidth: 640, margin: "18vh auto 0", textAlign: "left" }}>
                  <h2 style={{ fontSize: 34, margin: "0 0 var(--space-3)" }}>No letters yet.</h2>
                  <p style={{ fontSize: 17, color: "var(--color-neutral-400)", margin: 0 }}>{me.repos.length ? "Pick “New letter” to write one from your recent work." : "Open Settings and pick the repos Newsly should read."}</p>
                </div>
              )}
              {hasLetter && cur && (
                <div style={{ maxWidth: 660, margin: "0 auto" }}>
                  <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: "var(--space-3)" }}>Subject · <span style={{ color: "var(--color-text)" }}>{cur.letter.subject}</span></div>
                  <article style={{ background: "var(--color-neutral-100)", color: "var(--color-neutral-900)", padding: "clamp(28px,5vw,60px)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}><span style={{ fontWeight: 600, color: "#0088b0" }}>{me.companyName}</span><span>{cur.period}</span></div>
                    <div style={{ height: 3, background: "var(--color-neutral-900)", margin: "10px 0 2px" }} /><div style={{ height: 1, background: "var(--color-neutral-900)", marginBottom: "var(--space-6)" }} />
                    <div style={{ fontSize: 14, color: "var(--color-neutral-700)", marginBottom: "var(--space-4)", fontStyle: "italic" }}>{cur.letter.preheader}</div>
                    <h1 style={{ overflowWrap: "anywhere", fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.08, margin: "0 0 var(--space-4)", color: "var(--color-neutral-900)" }}>{cur.letter.subject}</h1>
                    <p style={{ fontSize: 18, lineHeight: 1.6, margin: "0 0 var(--space-3)" }}>{cur.letter.greeting}</p>
                    <p style={{ fontSize: 18, lineHeight: 1.6, margin: "0 0 var(--space-6)" }}>{cur.letter.intro}</p>
                    {cur.letter.sections.map((s, i) => (
                      <div key={i} style={{ marginBottom: "var(--space-6)" }}>
                        <h2 style={{ fontSize: 23, margin: "0 0 var(--space-1)", color: "#006786" }}>{s.heading}</h2>
                        {s.body.split(/\n\s*\n/).filter(Boolean).map((p, j, all) => (
                          <p key={j} style={{ fontSize: 17, lineHeight: 1.6, margin: j < all.length - 1 ? "0 0 var(--space-3)" : 0 }}>{p}</p>
                        ))}
                      </div>
                    ))}
                    <p style={{ fontSize: 18, lineHeight: 1.6, margin: "var(--space-8) 0 var(--space-4)" }}>{cur.letter.closing}</p>
                    <p style={{ fontSize: 18, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>{cur.letter.signature}</p>
                    <div style={{ marginTop: "var(--space-8)", fontSize: 12, color: "var(--color-neutral-700)" }}>You get this letter because you subscribed. <u>Unsubscribe</u></div>
                  </article>
                </div>
              )}
            </section>

            {showActions && (
              <div style={{ position: "absolute", top: "var(--space-4)", right: "var(--space-6)", display: "flex", gap: "var(--space-2)", alignItems: "center", zIndex: 2 }}>
                <button className="btn btn-secondary" style={{ minHeight: 42, fontSize: 15, background: "var(--color-bg)" }} onClick={sendTest} disabled={busy || !me.email}>{testLabel}</button>
                <button className="btn btn-primary" style={{ minHeight: 42, fontSize: 15 }} disabled={approveDisabled} onClick={approve} title={approveTitle}>{approveLabel}</button>
              </div>
            )}
          </main>
        </div>
      )}

      {compose && (
        <div style={{ position: "absolute", left: 304, top: 0, right: 0, bottom: 0, zIndex: 4, background: "var(--color-bg)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "var(--space-4) var(--space-6)" }}><button className="btn btn-ghost" style={{ fontSize: 15, paddingInline: 0 }} onClick={() => setCompose(false)}>← Back to letters</button></div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 clamp(16px,5vw,80px)" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-6)", paddingBottom: "var(--space-6)" }}>
              {chat.length === 0 && (
                <div style={{ paddingTop: "8vh" }}>
                  <h1 style={{ fontSize: "clamp(34px,4.6vw,56px)", lineHeight: 1.05, margin: "0 0 var(--space-3)" }}>What should this letter say?</h1>
                  <p style={{ fontSize: 19, lineHeight: 1.5, margin: "0 0 var(--space-6)", color: "var(--color-neutral-400)", maxWidth: 560 }}>Describe the letter you want. Newsly reads your GitHub work for the period and writes it in plain language.</p>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "var(--space-2)" }}>
                    {SUGGESTIONS.map((t) => <button key={t} className="btn btn-secondary" style={{ fontSize: 15, textAlign: "left", minHeight: 42, height: "auto", paddingBlock: 8 }} onClick={() => setPrompt(t)}>{t}</button>)}
                  </div>
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} style={m.role === "user" ? { paddingLeft: "var(--space-6)" } : undefined}>
                  <div style={{ fontSize: 12, letterSpacing: "0.06em", marginBottom: 6, color: m.role === "user" ? "var(--color-neutral-400)" : "var(--color-accent-400)" }}>{m.role === "user" ? "You" : "Newsly"}</div>
                  <div style={{ fontSize: 18, lineHeight: 1.55 }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "var(--space-3) clamp(16px,5vw,80px) var(--space-6)" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", flexWrap: "wrap", fontSize: 14, color: "var(--color-neutral-400)" }}>
                <span>Period</span>
                <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} />
                <span>to</span>
                <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} />
                <span style={{ fontSize: 13 }}>A date in your prompt (2026-10-01 or 1/10) overrides the start.</span>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
                <textarea className="input" rows={2} placeholder="e.g. A letter that sums up everything since 1/10" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  style={{ flex: 1, minHeight: 64, fontSize: 17, padding: "12px 14px", resize: "none" }} />
                <button className="btn btn-primary" style={{ minHeight: 64, paddingInline: 24, fontSize: 16 }} disabled={busy || !prompt.trim()} onClick={send}>Write</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && me && <Settings me={me} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await load(); }} onDeleted={() => { setSettingsOpen(false); setView("welcome"); setMe(null); setLetters([]); }} />}
    </div>
  );
}

/** The Newsly mark: the serif N printed as misregistered cyan and magenta plates. */
function Logo({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="" width={size} height={size} style={{ display: "block", flex: "none" }} />;
}

/** Settings dialog, in the design system's dialog/field/input classes: repos, recipients, sender, test address. */
function Settings({ me, onClose, onSaved, onDeleted }: { me: Me; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(me.repos);
  const [companyName, setCompanyName] = useState(me.companyName);
  const [email, setEmail] = useState(me.email);
  const [subscribers, setSubscribers] = useState(me.subscribers.join("\n"));
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstTime = me.repos.length === 0;

  useEffect(() => {
    api<{ repos: Repo[] }>("/api/repos").then((r) => setRepos(r.repos)).catch((e) => { setRepoError(e.message); setRepos([]); });
  }, []);

  const emails = subscribers.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const shown = (repos ?? []).filter((r) => !filter || r.fullName.toLowerCase().includes(filter.toLowerCase()));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ repos: picked, companyName, email, subscribers: emails }) });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api("/api/me", { method: "DELETE" }); onDeleted(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 5 }} onClick={firstTime ? undefined : onClose}>
      <div className="dialog" style={{ width: "min(520px,92vw)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title" style={{ fontSize: 24 }}>{firstTime ? "Pick what Newsly reads" : "Settings"}</h3>
        <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ fontSize: 15, color: "var(--color-neutral-300)" }}>
            {firstTime ? "Tick the repos your customers care about. Newsly reads their commit messages and dates, never code, and writes your first letter right away." : "Repos, who gets the letter, and who it’s from."}
          </div>
          <div className="field">
            <label>Repos ({picked.length} picked)</label>
            <input className="input" placeholder="Filter repos" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div style={{ marginTop: 6, maxHeight: 200, overflow: "auto", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {repos === null && <span style={muted}>Loading…</span>}
              {repoError && <span style={{ color: "var(--color-accent-2-400)" }}>{repoError}</span>}
              {repos && !repoError && shown.length === 0 && <span style={muted}>No repos found.</span>}
              {shown.map((r) => (
                <label key={r.fullName} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" style={{ accentColor: "#2a9fc4" }} checked={picked.includes(r.fullName)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.fullName] : picked.filter((x) => x !== r.fullName))} />
                  <span style={{ overflowWrap: "anywhere" }}>{r.fullName}</span>{r.private && <span className="tag tag-neutral" style={{ padding: "1px 6px" }}>private</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="field"><label>Subscribers (one email per line)</label><textarea className="input" value={subscribers} onChange={(e) => setSubscribers(e.target.value)} placeholder={"anna@example.se\nerik@example.se"} /></div>
          <div className="field"><label>Company name (the letter is from)</label><input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
          <div className="field"><label>Your email (for test letters)</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <div style={{ color: "var(--color-accent-2-400)" }}>{error}</div>}
          {!firstTime && (
            <div style={{ fontSize: 13 }}>
              {!confirmDelete
                ? <button className="btn btn-ghost" style={{ paddingInline: 0, color: "var(--color-accent-2-400)" }} onClick={() => setConfirmDelete(true)}>Delete account and disconnect GitHub</button>
                : <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>Everything is deleted and GitHub access revoked.
                    <button className="btn btn-secondary" style={{ color: "var(--color-accent-2-400)" }} disabled={busy} onClick={remove}>Yes, delete</button>
                    <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></span>}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          {!firstTime && <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
          <button className="btn btn-primary" onClick={save} disabled={busy || picked.length === 0}>{firstTime ? "Write my first letter" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
