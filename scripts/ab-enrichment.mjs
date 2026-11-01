// ③4.1 real-machine A/B (add-tool-description-enrichment): the SAME tool-
// discovery task twice — enrichment ON (default) vs OFF (owner preference) —
// comparing the quoted description (curated brief vs raw upstream) and turn
// usage. Protocol: flip preference → set_preset (re-composes patches through
// writeMcpPatch, which reads the switch) → turn → restore.
// Usage: node scripts/ab-enrichment.mjs [companionPresetId]
import { execSync } from "node:child_process";

const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const H = { cookie: process.env.PAAS_COOKIE, "content-type": "application/json" };
if (!H.cookie) { console.error("PAAS_COOKIE missing"); process.exit(2); }
const rest = async (path, init) => fetch(`${BASE}${path}`, { headers: H, ...init });
const COMPANION = process.argv[2] ?? "user.preset-3";
const PROMPT = "用 tool_search 搜索能在 github 仓库里创建 issue 的工具，把它的 description 关键内容原样引用给我（引用原文即可，不要改写）。";

const cur = await rest("/api/preferences").then((r) => r.json());
const before = cur.preferences?.["tool.description.enrichment"];
console.log("PREF before:", JSON.stringify(before), "(undefined = default ON)");

const run = (label) => {
  const out = execSync(`node scripts/realturn.mjs ${JSON.stringify(PROMPT)} 240`, { env: process.env, encoding: "utf8", timeout: 260_000, cwd: process.cwd() });
  const usage = (out.match(/USAGE: (.*)/) ?? [])[1] ?? "null";
  const final = (out.match(/FINAL: (.*)/) ?? ["", ""])[1];
  const quoted = /Creates a real GitHub issue/i.test(final);
  const rawish = /GitHub API|issues\./i.test(final) && !quoted;
  console.log(`${label} USAGE: ${usage}`);
  console.log(`${label} FINAL: ${final.slice(0, 220)}`);
  console.log(`${label} DESC-SOURCE: ${quoted ? "curated-brief (enriched face)" : rawish ? "raw-upstream" : "unclear"}`);
  return { usage, quoted };
};

console.log("== Arm A: enrichment ON (default) ==");
const a = run("A");

console.log("== Flip OFF ==");
await rest("/api/preferences", { method: "PUT", body: JSON.stringify({ key: "tool.description.enrichment", value: false }) });
console.log("set_preset:", execSync(`node scripts/ws-one.mjs set_preset ${JSON.stringify(COMPANION)} 90`, { env: process.env, encoding: "utf8", timeout: 120_000, cwd: process.cwd() }).trim().slice(0, 100));
console.log("== Arm B: enrichment OFF ==");
const b = run("B");

console.log("== Restore ON ==");
await rest("/api/preferences", { method: "PUT", body: JSON.stringify({ key: "tool.description.enrichment", value: true }) });
console.log("set_preset:", execSync(`node scripts/ws-one.mjs set_preset ${JSON.stringify(COMPANION)} 90`, { env: process.env, encoding: "utf8", timeout: 120_000, cwd: process.cwd() }).trim().slice(0, 100));

const parse = (u) => { try { return JSON.parse(u); } catch { return null; } };
const ua = parse(a.usage); const ub = parse(b.usage);
console.log("A/B VERDICT:",
  a.quoted && !b.quoted ? "PASS (A quoted the curated brief; B quoted raw — the switch is live and no degradation observed)"
  : a.quoted && b.quoted ? "INCONCLUSIVE (B still quoted brief — overlay may not have regenerated; check set_preset recomposition)"
  : "REVIEW (see FINAL lines)");
if (ua && ub) console.log("TOKEN DELTA (B-A):", ub.inputTokens - ua.inputTokens, "in /", ub.outputTokens - ua.outputTokens, "out");
