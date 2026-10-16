# Newsly

**Problem:** you ship improvements every week, and your customers never hear about them.
**Newsly:** reads what you shipped on GitHub (or what you type in) and sends your customers a short, non-technical
weekly letter about what *they* gain. No jargon, nothing made up.

**Live:** https://newsly-neon.vercel.app (Vercel project `mykyta-g/newsly`, pushes to `main` deploy automatically once Git is connected)

## The flow

1. **Welcome** → "Log in with GitHub".
2. **Connect** → on GitHub, the customer picks which repos Newsly may read. Read-only, only those repos, and only
   commit messages + dates (never code or files).
3. **Done.** Right after connecting, Newsly writes the first letter from the last 7 days in the background and emails
   it to the customer as a test (their GitHub email). Every Monday 06:00 UTC it does the same for last week.
   A second AI pass checks every letter for tech words and made-up claims before anything goes out.
4. **The first letter needs a nod:** the customer gets a test email, looks at it, and approves. After that they can switch
   approval off, and it sends by itself (only letters that pass the check; failing ones wait for a human).

No repo? (e.g. Simple Schedules) The customer types the week's news as bullet points instead.

## Who does what

- **Backend (this repo):** `src/lib/*` + `src/app/api/*`. That's the part Gunnar/Mykyta is building.
- **Frontend: Ludvig.** `src/app/dashboard/` is only a plain test console showing every API call working. Replace it freely.
  Everything the UI needs is in the API below.

## API for the frontend

All routes are same-origin JSON. Login is a httpOnly cookie set by the GitHub callback, so just call `fetch("/api/...")`.
Errors come back as `{ "error": "message in Swedish, safe to show the user" }` with a 4xx/5xx status.

| Route | What it does |
|---|---|
| `GET /api/auth/login` | Link the "Log in with GitHub" button here. Comes back to `/dashboard`. |
| `POST /api/auth/logout` | Log out. |
| `GET /api/me` | The logged-in account (see shape below). `401` = not logged in → show Welcome. Poll it while `job.state === "running"` (first letter being written, ~1 min). |
| `PATCH /api/me` | Save any account fields (all optional): `email, profileKey, companyName, profileText, brandColor, source, repos, manualNotes, subscribers, requireApproval`. Returns the updated account. |
| `DELETE /api/me` | Delete the account and revoke GitHub access. |
| `GET /api/repos` | `{ repos: ["owner/name"], installUrl }`. Repos the customer granted on GitHub. `installUrl` = "pick repos / remove access" link. |
| `POST /api/draft` `{ from, to }` | Write + review a new letter for the period (`YYYY-MM-DD`) and email it to the customer as a test. Takes up to a minute. Returns the draft. |
| `POST /api/draft/test` | Re-send the current draft to the customer's own address. |
| `POST /api/draft/approve` `{ createdAt, override? }` | Send the draft to all subscribers. Needs a test email first; `override: true` only if the draft failed review. |
| `GET /api/github/installed` | Where GitHub sends people after they pick repos. Not for the UI. |
| `GET /api/unsubscribe?…` | The link inside each email. Not for the UI. |
| `GET /api/cron/weekly` | Weekly job, run by Vercel Cron. Not for the UI. |

### Account (`GET /api/me`)

```ts
{
  id, login,                     // GitHub user
  githubConnected: boolean,
  email: string,                 // where test emails go
  profileKey: "klyro" | "simple-schedules" | "custom",
  companyName, brandColor, profileText,  // who the letter is from, tone, rules
  source: "github" | "manual",
  repos: string[],               // repos being tracked
  manualNotes: string,           // the week's bullet points when source = "manual"
  subscribers: string[],         // recipient emails
  requireApproval: boolean,      // can only be turned off after the first approved send
  approvedOnce: boolean,
  draft: null | {
    from, to, createdAt, testSentAt?,
    status: "godkänd" | "manuell",       // manuell = failed the check twice, a human must read it
    problems: { typ, citat, åtgärd }[],  // what the checker flagged
    letter: { subject, preheader, greeting, intro, sections: { heading, body }[], closing, signature },
    html: string,                        // the finished email; show it in <iframe srcDoc={html} sandbox="">
    underlag: string                     // the raw input GPT got (for a "show source" toggle)
  },
  lastLetter: null | Letter,     // the last one sent
  job: null | { state: "running" | "failed", error?, at },  // background letter writing
  effectiveProfile: string       // the profile actually used (a sensible default until they write their own)
}
```

## How a letter is made

`src/lib/prompts.ts` has the prompts word for word from the spec (system prompt, customer profiles, user message, checker).

1. Collect the input: commit messages + dates for the period (bots and merges dropped), or the typed bullet points.
2. GPT writes the letter as JSON. It never writes HTML.
3. The checker (a second GPT call plus the same checks in code) looks for tech words, made-up claims, hype, length,
   exclamation marks and emojis.
4. If it fails: "fix only these problems" → check again. Fails twice → marked `manuell`, never sent automatically.
5. `src/lib/template.ts` turns the JSON into the email with a fixed template in the customer's colour.
6. Resend sends one email per recipient, each with its own unsubscribe link.

## Status

- [x] Writer, checker, fix loop, email template, Resend sending, unsubscribe
- [x] GitHub login + read-only repo access (GitHub App), tokens encrypted on the server
- [x] Storage: private Vercel Blob store `newsly-data` (Stockholm), one JSON record per account
- [x] Deployed on Vercel with all env vars, weekly cron in `vercel.json`
- [x] Tested on real data: last week's Simple Schedules commits → letter in ~1 min
- [ ] Email sending only reaches the Resend account owner until a sending domain is verified in Resend
- [ ] Frontend (Ludvig)

## Run locally

```bash
npm install
npm run setup        # asks for your keys in the terminal, writes .env.local
npm run github-app -- https://newsly-neon.vercel.app   # one-time: creates the GitHub App (one click)
npm run dev
```

Env vars: see `.env.example`.
