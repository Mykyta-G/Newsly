#!/usr/bin/env node
// Creates Newsly's GitHub App in one click (GitHub "app manifest" flow) and saves its IDs to .env.local.
// Usage: npm run github-app -- https://your-app.vercel.app   [--org your-org]
import { exec } from "node:child_process";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import http from "node:http";

const args = process.argv.slice(2);
const appUrl = (args.find((a) => a.startsWith("http")) ?? "http://localhost:3000").replace(/\/$/, "");
const org = args.includes("--org") ? args[args.indexOf("--org") + 1] : null;
const PORT = 3999;

const manifest = {
  name: "Newsly",
  url: appUrl,
  description: "Veckobrev till era kunder, skrivna från det ni faktiskt har gjort. Läser bara commit-texter och datum.",
  hook_attributes: { url: `${appUrl}/api/github/webhook`, active: false },
  redirect_url: `http://localhost:${PORT}/done`,
  callback_urls: [`${appUrl}/api/auth/callback`, "http://localhost:3000/api/auth/callback"],
  setup_url: `${appUrl}/api/github/installed`,
  setup_on_update: true,
  public: true, // so other people's accounts can install it
  default_permissions: { contents: "read", email_addresses: "read" }, // read-only, nothing else
  default_events: [],
};

const target = org ? `https://github.com/organizations/${org}/settings/apps/new` : "https://github.com/settings/apps/new";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function saveEnv(values) {
  let lines = [];
  try { lines = readFileSync(".env.local", "utf8").split("\n").filter(Boolean); } catch {}
  for (const [k, v] of Object.entries(values)) {
    lines = lines.filter((l) => !l.startsWith(`${k}=`));
    lines.push(`${k}="${v}"`);
  }
  writeFileSync(".env.local", lines.join("\n") + "\n");
  chmodSync(".env.local", 0o600);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">
      <p>Skickar dig till GitHub…</p>
      <form id="f" method="post" action="${target}?state=newsly"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}"></form>
      <script>document.getElementById("f").submit()</script>`);
  }
  if (url.pathname === "/done") {
    const code = url.searchParams.get("code");
    const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: "POST", headers: { Accept: "application/vnd.github+json" },
    });
    const app = await r.json();
    if (!r.ok) {
      res.writeHead(500); res.end("GitHub said: " + JSON.stringify(app));
      console.error("Failed:", app); server.close(); process.exitCode = 1; return;
    }
    saveEnv({ GITHUB_APP_SLUG: app.slug, GITHUB_CLIENT_ID: app.client_id, GITHUB_CLIENT_SECRET: app.client_secret });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<body style="font-family:sans-serif;padding:40px"><h2>Klart.</h2><p>GitHub-appen <b>${esc(app.slug)}</b> är skapad. Du kan stänga fliken.</p>`);
    console.log(`\nCreated GitHub App "${app.slug}" → saved GITHUB_APP_SLUG, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET to .env.local`);
    console.log(`Settings: ${app.html_url}`);
    server.close();
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  const open = `http://localhost:${PORT}/`;
  console.log(`Opening ${open} → GitHub. Click "Create GitHub App" (rename it if "Newsly" is taken).`);
  exec(`open "${open}"`);
});
