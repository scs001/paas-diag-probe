// Live-cast check on ONE WS connection: set_preset (await ack whose id MATCHES
// the request — the server also pushes current state on open, which races the
// naive ack), tolerate one restart drop with a reconnect, then run the probe
// turn and inspect the tail text. Usage: node scripts/live-check.mjs [presetId]
import WebSocket from "ws";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const preset = process.argv[2] ?? "user.preset-3";
const prompt = "用一句话说明你的角色定位，并按你的角色要求在末尾附上该附的行。";

function connect() { return new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } }); }

async function setPreset() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const got = await new Promise((resolve) => {
      const ws = connect();
      let done = false;
      const fin = (v) => { if (!done) { done = true; try { ws.close(); } catch {} resolve(v); } };
      ws.on("open", () => ws.send(JSON.stringify({ type: "set_preset", id: preset })));
      ws.on("message", (raw) => {
        let d; try { d = JSON.parse(raw.toString()); } catch { return; }
        if (d.type === "current_preset" && d.id === preset) fin({ ok: true, ack: d.id });
        else if (d.type === "error") fin({ ok: false, err: JSON.stringify(d).slice(0, 140) });
      });
      ws.on("error", () => fin({ ok: false, err: "drop" })); // restart drop → retry
      setTimeout(() => fin({ ok: false, err: "timeout" }), 45_000);
    });
    if (got.ok) return got;
    console.log(`set_preset attempt ${attempt}: ${got.err} — retrying`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false };
}

const sp = await setPreset();
console.log("set_preset:", sp.ok ? `confirmed id=${sp.ack}` : `FAILED (${sp.err ?? "exhausted"})`);
if (!sp.ok) process.exit(1);
await new Promise((r) => setTimeout(r, 6000)); // let the idle restart settle

// Probe turn on a fresh connection (the runtime is now on the target preset).
const ws = connect();
let buf = "";
const tools = new Set();
let finalText = "";
let usage = null;
ws.on("open", () => ws.send(JSON.stringify({ type: "prompt", text: prompt })));
ws.on("message", (raw) => {
  let d; try { d = JSON.parse(raw.toString()); } catch { return; }
  if (d.type === "tool_start" && d.name) tools.add(d.name);
  if (d.type === "text" && d.delta) buf += d.delta;
  if (d.type === "final" || d.type === "turn_ended") {
    if (d.text) finalText = d.text;
    if (d.usage) usage = d.usage;
    setTimeout(() => {
      const tail = (finalText || buf).trim().slice(-300);
      console.log("TOOL_CALLS:", [...tools].join(",") || "(none)");
      console.log("USAGE:", usage ? JSON.stringify(usage).slice(0, 200) : "null");
      console.log("FINAL:", tail);
      console.log("LIVE-CHECK:", tail.includes("探针 OK") ? "PASS — preset persona behavior confirmed in live cast" : "FAIL");
      process.exit(tail.includes("探针 OK") ? 0 : 1);
    }, 4000);
  }
});
ws.on("error", (e) => console.log("WS-FAIL:", String(e).slice(0, 120)));
setTimeout(() => {
  const tail = (finalText || buf).trim().slice(-300);
  console.log("TIMEOUT-WINDOW");
  console.log("TOOL_CALLS:", [...tools].join(",") || "(none)");
  console.log("FINAL:", tail || "(no text captured)");
  console.log("LIVE-CHECK:", tail.includes("探针 OK") ? "PASS" : "FAIL (timeout)");
  process.exit(tail.includes("探针 OK") ? 0 : 1);
}, 180_000);
