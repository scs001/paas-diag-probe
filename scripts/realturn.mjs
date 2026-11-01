// Real-turn driver over the production chat WebSocket (add-persona-self-
// evolution 4.2 / add-tool-description-enrichment 4.1 evidence collector).
//
// Usage: node scripts/realturn.mjs "<prompt text>" [maxSeconds]
// Prints: TOOL_CALLS: <names seen>, USAGE: {inputTokens, outputTokens},
// FINAL: <last 300 chars of the assistant text>. Exit 0 on a finished turn.
//
// Protocol (server/ws.js): connect to /ws with the session cookie, send
// {type:"prompt", text}, collect events until the turn settles (an assistant
// message with no streaming successor, or a 6s idle window).
import WebSocket from "ws";

const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
if (!cookie) { console.error("PAAS_COOKIE missing"); process.exit(2); }
const text = process.argv[2];
if (!text) { console.error("usage: realturn.mjs <prompt> [maxSeconds]"); process.exit(2); }
const maxSec = Number(process.argv[3] ?? 300);

const wsUrl = BASE.replace(/^http/, "ws") + "/ws";
const ws = new WebSocket(wsUrl, { headers: { cookie } });

const toolCalls = new Set();
let usage = null;
let finalText = "";
let settled = false;
let streamOpen = false;
let idleTimer = null;
let lastActivity = Date.now();

const armIdle = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (Date.now() - lastActivity > 12000) settled = true; }, 12000);
};

const deadline = setTimeout(() => { console.log("TIMEOUT after", maxSec, "s"); settled = true; }, maxSec * 1000);

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "prompt", text }));
});
const typeCounts = {};
const samples = {};
ws.on("message", (raw) => {
  let d;
  try { d = JSON.parse(raw.toString()); } catch { return; }
  lastActivity = Date.now();
  const t = d.type ?? "(none)";
  typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  if (!samples[t]) samples[t] = JSON.stringify(d).slice(0, 160);
  if (process.env.DEBUG_TYPES) {
    if (typeCounts[t] <= 2) console.log(`  [${t}]`, samples[t]);
  }
  if (d.type === "error") { console.log("WS-ERROR:", String(d.message).slice(0, 140)); }
  // Tool calls: any event carrying a tool name.
  const name = d.name ?? d.toolName ?? d.block?.name ?? d.tool?.name;
  const isTool = d.type === "tool_start" || d.type === "tool_call" || d.type === "tool"
    || (d.type === "block" && d.block?.kind === "tool") || (d.type === "block_delta" && d.block?.kind === "tool")
    || (d.type === "blocks" && Array.isArray(d.blocks));
  if (isTool && typeof name === "string" && name) toolCalls.add(name);
  if (d.type === "message_end" || d.type === "assistant_message" || d.type === "turn_usage") {
    const u = d.usage ?? d.message?.usage;
    if (u?.inputTokens || u?.outputTokens) usage = u;
  }
  // Text carriers: prefer the largest accumulated text seen.
  const candidates = [d.text, d.delta, d.block?.text, d.message?.text];
  if (Array.isArray(d.blocks)) {
    const texts = d.blocks.filter((b) => b?.kind === "text").map((b) => b.text ?? "").join("\n");
    if (texts.length > finalText.length) { finalText = texts; streamOpen = true; armIdle(); }
    for (const b of d.blocks) if (b?.kind === "tool" && b.name) toolCalls.add(b.name);
  }
  for (const c of candidates) {
    if (typeof c === "string" && c.length > finalText.length) { finalText = c; streamOpen = true; armIdle(); }
  }
  if (d.type === "turn_ended" || d.type === "turn_end" || d.type === "message_end") { settled = true; }
  if (d.type === "retry_scheduled") console.log(`  retry: ${d.delayMs ?? d.delay ?? "?"}ms — ${String(d.error ?? "").slice(0, 80)}`);
  if (d.usage?.inputTokens || d.usage?.outputTokens) usage = d.usage;
});
ws.on("error", (e) => { console.log("WS-FAIL:", String(e).slice(0, 120)); process.exit(1); });

const t0 = Date.now();
while (!settled && Date.now() - t0 < maxSec * 1000) {
  await new Promise((r) => setTimeout(r, 500));
}
clearTimeout(deadline);
try { ws.close(); } catch {}

console.log("TOOL_CALLS:", [...toolCalls].join(",") || "(none)");
console.log("USAGE:", JSON.stringify(usage));
if (process.env.DEBUG_TYPES) console.log("TYPES:", JSON.stringify(typeCounts));
console.log("FINAL:", finalText.replace(/\s+/g, " ").slice(-300));
process.exit(finalText || toolCalls.size ? 0 : 1);
