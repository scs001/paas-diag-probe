// One-shot WS control message: node scripts/ws-one.mjs <type> [jsonArgs] [maxSec]
// Prints the last relevant ack line (current_preset / error / …) and exits.
// Args are lenient: a JSON object, or a bare preset id (wrapped as {"id":...}).
// The server also emits raw non-JSON frames (e.g. echoing the preset id) — ignore them.
import WebSocket from "ws";

const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const type = process.argv[2];
const argsRaw = process.argv[3] ?? "{}";
const maxSec = Number(process.argv[4] ?? 60);
if (!cookie || !type) { console.error("usage: ws-one.mjs <type> [jsonArgs] [maxSec]  (PAAS_COOKIE env)"); process.exit(2); }

let args;
try { args = JSON.parse(argsRaw); } catch { args = { id: argsRaw }; }
if (typeof args === "string") args = { id: args };

const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } });
const acks = [];
let done = false;
ws.on("open", () => ws.send(JSON.stringify({ type, ...args })));
ws.on("message", (raw) => {
  let d; try { d = JSON.parse(raw.toString()); } catch { return; }
  if (d.type === "current_preset" || d.type === "error" || d.type === "current_model") {
    acks.push(JSON.stringify(d).slice(0, 160));
    if (d.type !== "current_model") done = true;
  }
});
ws.on("error", (e) => { console.log("WS-FAIL:", String(e).slice(0, 120)); process.exit(1); });
const t0 = Date.now();
while (!done && Date.now() - t0 < maxSec * 1000) await new Promise((r) => setTimeout(r, 300));
try { ws.close(); } catch {}
console.log(acks.at(-1) ?? "(no ack)");
process.exit(acks.length ? 0 : 1);
