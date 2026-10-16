# Newsly

**Problem:** you ship updates, but your customers don't know about them.
**Newsly:** tracks your GitHub activity and turns it into a customer-friendly newsletter.

## Flow
GitHub (commits, merged PRs, releases) → GPT writes the newsletter → you review → Resend emails your subscribers.

## Stack
Next.js 16 (App Router) · Tailwind 4 · Octokit · OpenAI · Resend · JSON-file storage (hackathon)

## Run
```bash
npm run setup   # asks for your keys in the terminal, writes .env.local
npm run dev
```

## API
| Route | What it does |
|---|---|
| `GET /api/activity?repo=owner/name&days=7` | Raw GitHub activity |
| `POST /api/subscribe` `{ email }` | Add a subscriber |
| `POST /api/newsletter/preview` `{ repo?, days?, productName? }` | Draft newsletter, sends nothing |
| `POST /api/newsletter/send` `{ subject, html }` | Send the draft to all subscribers |

## Layout
- `src/lib/github.ts` — fetch activity
- `src/lib/newsletter.ts` — GPT prompt → `{ subject, html }`
- `src/lib/email.ts` — Resend batch send
- `src/lib/store.ts` — subscribers (`data/subscribers.json`)
