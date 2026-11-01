// One-shot WS control message: node scripts/ws-one.mjs <type> [jsonArgs] [maxSec]
// Prints the last relevant ack line (current_preset / error / …) and exits.
import WebSocket from "ws";

const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const type = process.argv[2];
const argsJson = process.argv[3] ?? "{}";
const maxSec = Number(process.argv[4] ?? 60);
if (!cookie || !type) { console.error("usage: ws-one.mjs <type> [jsonArgs] [maxSec]  (PAAS_COOKIE env)"); process.exit(2); }

const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } });
const acks = [];
let done = false;
ws.on("open", () => ws.send(JSON.stringify({ type, ...JSON.parse(argsJson) })));
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
