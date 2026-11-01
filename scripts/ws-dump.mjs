// Full WS traffic dump for one turn: every message's type + compact JSON, so
// the real event shapes (assistant text, tool calls/outputs) are visible.
import WebSocket from "ws";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const text = process.argv[2] ?? "调用 tool_search 搜索 persona，把原始结果贴出来。";
const maxSec = Number(process.argv[3] ?? 240);
const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } });
const seen = new Set();
let n = 0;
ws.on("open", () => ws.send(JSON.stringify({ type: "prompt", text })));
ws.on("message", (raw) => {
  let d; try { d = JSON.parse(raw.toString()); } catch { return; }
  n++;
  const t = d.type ?? "(none)";
  if (!seen.has(t)) { seen.add(t); console.log(`#${n} [${t}] ${JSON.stringify(d).slice(0, 300)}`); }
  else if (t === "text" || t === "tool" || t === "blocks" || t === "block" || t === "message" || t === "turn_ended") {
    console.log(`#${n} [${t}] ${JSON.stringify(d).slice(0, 300)}`);
  }
});
ws.on("error", (e) => console.log("WS-FAIL:", String(e).slice(0, 100)));
setTimeout(() => { console.log("TOTAL", n); process.exit(0); }, maxSec * 1000);
