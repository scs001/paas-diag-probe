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

const armIdle = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (streamOpen) settled = true; }, 6000);
};

const deadline = setTimeout(() => { console.log("TIMEOUT after", maxSec, "s"); settled = true; }, maxSec * 1000);

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "prompt", text }));
});
ws.on("message", (raw) => {
  let d;
  try { d = JSON.parse(raw.toString()); } catch { return; }
  if (d.type === "error") { console.log("WS-ERROR:", String(d.message).slice(0, 140)); }
  if (d.type === "tool_start" || d.type === "tool_call") toolCalls.add(d.name ?? d.toolName ?? "?");
  if (d.type === "tool" && d.name) toolCalls.add(d.name);
  if (d.type === "block" && d.block?.kind === "tool") toolCalls.add(d.block.name);
  if (d.type === "message_end" || d.type === "assistant_message") {
    if (d.usage) usage = d.usage;
    if (d.message?.usage) usage = d.message.usage;
  }
  // Streaming text: keep the latest assistant text tail.
  if ((d.type === "text_delta" || d.type === "text") && typeof d.text === "string") { finalText = d.text; streamOpen = true; armIdle(); }
  if (d.type === "assistant" && typeof d.text === "string") { finalText = d.text; streamOpen = true; armIdle(); }
  if (d.type === "block_delta" && d.block?.kind === "text") { finalText = d.block.text ?? finalText; streamOpen = true; armIdle(); }
  if (d.type === "blocks" && Array.isArray(d.blocks)) {
    const texts = d.blocks.filter((b) => b.kind === "text").map((b) => b.text ?? "");
    if (texts.length) { finalText = texts.join("\n"); }
    for (const b of d.blocks) if (b.kind === "tool") toolCalls.add(b.name);
  }
  if (d.type === "turn_ended" || d.type === "turn_end") { settled = true; }
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
console.log("FINAL:", finalText.replace(/\s+/g, " ").slice(-300));
process.exit(finalText || toolCalls.size ? 0 : 1);
