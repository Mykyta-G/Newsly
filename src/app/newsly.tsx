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
const CHECKS = ["No tech words", "No made-up claims", "No hype or exclamation marks", "Length within limit", "Plain text, no emojis"];
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
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showSource, setShowSource] = useState(false);
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
    // Fetch on open; state is only set after the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then((m) => { if (m && m.repos.length === 0) setSettingsOpen(true); });
  }, [load]);

  // The first letter is written in the background after repos are picked: check back until it's there.
  const running = me?.job?.state === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const q = query.trim().toLowerCase();
  const list = letters.filter((l) => !q || l.title.toLowerCase().includes(q));
  const cur = letters.find((l) => l.id === sel) ?? letters[0] ?? null;
  const isGenerating = generating || running;
  const hasLetter = !isGenerating && !!cur;
  const isSent = cur?.status === "sent";
  const tested = !!cur?.testSentAt;
  const requireApproval = me?.requireApproval ?? true;
  const approveDisabled = busy || (requireApproval && !tested) || (me?.subscribers.length ?? 0) === 0;

  // Default period: the last 7 days, up to today.
  const openNew = () => {
    setFrom(ymd(new Date(Date.now() - 6 * 864e5)));
    setTo(ymd(new Date()));
    setNewOpen(true);
  };

  const generate = () => {
    setNewOpen(false); setGenerating(true); setError(null);
    api<{ createdAt: string }>("/api/draft", { method: "POST", body: JSON.stringify({ from, to }) })
      .then(async (d) => { await load(); setSel(d.createdAt); setShowSource(false); })
      .catch((e) => setError(e.message))
      .finally(() => setGenerating(false));
  };

  const sendTest = () => act(async () => { await api("/api/draft/test", { method: "POST" }); await load(); });
  const approve = () => act(async () => {
    if (!cur) return;
    await api("/api/draft/approve", { method: "POST", body: JSON.stringify({ id: cur.id, override: cur.status === "needs_review" }) });
    await load();
  });
  const toggleApproval = (checked: boolean) => act(async () => {
    setMe(await api<Me>("/api/me", { method: "PATCH", body: JSON.stringify({ requireApproval: checked }) }));
  });
  const logout = () => { fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); setView("welcome"); setMe(null); setLetters([]); };

  const testLabel = !me?.email ? "Add your email in Settings to get a test"
    : tested ? `Test sent to ${me.email} — send again` : `Send test email to ${me.email}`;
  const approveHint = (me?.subscribers.length ?? 0) === 0 ? "Add subscribers in Settings first."
    : cur?.status === "needs_review" ? "This letter failed the check twice. Read it carefully before you send it."
    : requireApproval && !tested ? "Send yourself a test email first, look it over, then approve."
    : "Goes out as one email per subscriber.";
  const approvalNote = requireApproval ? "Turn off to send passing letters automatically. Failed ones always wait for you." : "Passing letters send by themselves each week.";

  if (view === "loading") return <div style={{ height: "100vh", background: "#141211" }} />;

  return (
    <div style={{ "--color-bg": "#141211", "--color-surface": "#1e1b1a", "--color-text": "#ece9e8", "--color-divider": "rgba(236,233,232,0.16)", "--color-accent": "#2a9fc4", height: "100vh", width: "100%", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", overflow: "hidden", position: "relative" } as CSSProperties}>

      {view === "welcome" && (
        <div style={{ height: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr)", alignContent: "center", padding: "0 clamp(24px,8vw,140px)", gap: "var(--space-8)" }}>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: 10 }}><span style={{ color: "var(--color-accent-2-500)" }}>●</span>Newsly</div>
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
              <span style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--font-heading)", letterSpacing: "-0.02em" }}>Newsly</span>
              <button className="btn btn-ghost btn-icon" title="Settings" style={{ color: "var(--color-neutral-400)" }} onClick={() => setSettingsOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8l1.6 2.3 2.8-.5.9 2.7 2.6 1.2-.6 2.8 1.8 2.2-1.8 2.2.6 2.8-2.6 1.2-.9 2.7-2.8-.5L12 21.2l-1.6-2.3-2.8.5-.9-2.7-2.6-1.2.6-2.8L2.9 10.5l1.8-2.2-.6-2.8 2.6-1.2.9-2.7 2.8.5z" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: "0 12px", minHeight: 40, color: "var(--color-neutral-400)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" strokeLinecap="round" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search letters" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: 0, color: "var(--color-text)", font: "inherit", fontSize: 15 }} />
            </label>
            <button className="btn btn-secondary" style={{ margin: "var(--space-3) 0 var(--space-4)", justifyContent: "flex-start", gap: 10, minHeight: 42, fontSize: 15 }} onClick={openNew} disabled={isGenerating}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>New letter
            </button>
            <div style={{ fontSize: 13, color: "var(--color-neutral-500)", padding: "0 var(--space-2) var(--space-2)", letterSpacing: "0.04em" }}>Letters</div>
            <nav style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {list.map((l) => (
                <button key={l.id} onClick={() => { setSel(l.id); setShowSource(false); }} style={{ display: "flex", flexDirection: "column", gap: 5, textAlign: "left", cursor: "pointer", border: 0, borderRadius: "var(--radius-md)", padding: "10px 12px", color: "var(--color-text)", background: l.id === cur?.id ? "var(--color-surface)" : "transparent" }}>
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

          <main style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", overflow: "auto", minHeight: 0, minWidth: 0 }}>
            <section style={{ flex: "1 1 480px", padding: "var(--space-8) clamp(16px,4vw,64px) 64px", minWidth: 0, boxSizing: "border-box" }}>
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

            <aside style={{ flex: "1 1 340px", maxWidth: 400, boxSizing: "border-box", minHeight: "100%", padding: "var(--space-8) var(--space-6)", background: "#0f0d0c" }}>
              {hasLetter && cur && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                  <div>
                    <span className={STATUS[cur.status].tag}>{STATUS[cur.status].label}</span>
                    <h2 style={{ fontSize: 26, margin: "var(--space-3) 0 var(--space-1)" }}>{cur.title}</h2>
                    <div style={{ fontSize: 14, color: "var(--color-neutral-400)" }}>{cur.period}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 13, letterSpacing: "0.06em", color: "var(--color-neutral-400)", marginBottom: "var(--space-2)" }}>Review</div>
                    {cur.problems.length === 0 ? (
                      <>
                        <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 var(--space-3)" }}>Passed the check — no flagged problems.</p>
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
                          {CHECKS.map((c) => <li key={c} style={{ display: "flex", gap: 10, alignItems: "baseline" }}><span style={{ color: "var(--color-accent-400)" }}>✓</span><span>{c}</span></li>)}
                        </ul>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 var(--space-3)" }}>The check flagged {cur.problems.length === 1 ? "one thing" : `${cur.problems.length} things`}:</p>
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
                          {cur.problems.map((p, i) => <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}><span style={{ color: "var(--color-accent-2-400)" }}>!</span><span>{p.citat ? <>“{p.citat}” — </> : null}<span style={muted}>{p.åtgärd}</span></span></li>)}
                        </ul>
                      </>
                    )}
                  </div>

                  {isSent && <div style={{ fontSize: 15, lineHeight: 1.5 }}>Sent {cur.sentAt} to <b>{cur.recipients}</b> subscribers, one email each with its own unsubscribe link.</div>}

                  {!isSent && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                      <div style={{ fontSize: 13, letterSpacing: "0.06em", color: "var(--color-neutral-400)" }}>Send</div>
                      <button className="btn btn-secondary" style={{ minHeight: 44, fontSize: 15 }} onClick={sendTest} disabled={busy || !me.email}>{testLabel}</button>
                      <button className="btn btn-primary" style={{ minHeight: 48, fontSize: 16 }} disabled={approveDisabled} onClick={approve}>Approve and send to {cur.recipients} subscribers</button>
                      <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-400)" }}>{approveHint}</div>
                    </div>
                  )}

                  <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", fontSize: 15, lineHeight: 1.4 }}>
                    <input type="checkbox" checked={requireApproval} disabled={!me.approvedOnce || busy} onChange={(e) => toggleApproval(e.target.checked)} style={{ marginTop: 4, accentColor: "#2a9fc4", width: 16, height: 16 }} />
                    <span>Require approval before sending<br /><span style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>{approvalNote}</span></span>
                  </label>

                  <div>
                    <button className="btn btn-ghost" style={{ paddingInline: 0, fontSize: 15 }} onClick={() => setShowSource(!showSource)}>{showSource ? "Hide source" : "Show source (what the writer received)"}</button>
                    {showSource && (
                      <ul style={{ margin: "var(--space-2) 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 14, lineHeight: 1.4, color: "var(--color-neutral-300)" }}>
                        {cur.source.map((u, i) => <li key={i}>{u}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </main>
        </div>
      )}

      {newOpen && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 5 }} onClick={() => setNewOpen(false)}>
          <div className="dialog" style={{ width: "min(440px,92vw)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="dialog-title" style={{ fontSize: 24 }}>New letter</h3>
            <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ fontSize: 15, color: "var(--color-neutral-300)" }}>Pick the period Newsly should read from GitHub.</div>
              <div className="field"><label>From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="field"><label>To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={generate} disabled={!from || !to || from > to || me?.repos.length === 0}>Write letter</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && me && <Settings me={me} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await load(); }} onDeleted={() => { setSettingsOpen(false); setView("welcome"); setMe(null); setLetters([]); }} />}
    </div>
  );
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
