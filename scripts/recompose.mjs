// Trigger a full recomposition of a parked cell's runtime profile: set_preset
// rides switchPresetTo → writeMcpPatch (fresh DB rows) → idle restart. The WS
// connection DROPS during the restart — that is the expected shape, not an
// error. We then verify the recomposed patch via the REST tool-face.
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const target = process.argv[2] ?? "user.preset-3";
const backTo = process.argv[3] ?? "standard";

// set_preset is WS-only; drive it through two attempts tolerating the drop.
import WebSocket from "ws";
async function wsOne(msg, maxMs = 45_000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } });
    const acks = [];
    const done = (v) => { try { ws.close(); } catch {} resolve(v); };
    const t0 = Date.now();
    ws.on("open", () => ws.send(JSON.stringify(msg)));
    ws.on("message", (raw) => {
      let d; try { d = JSON.parse(raw.toString()); } catch { return; }
      if (["current_preset", "error", "current_agent"].includes(d.type)) acks.push(JSON.stringify(d).slice(0, 140));
      if (d.type === "current_preset") done(acks);
    });
    ws.on("error", () => done(acks)); // the restart drop lands here — expected
    ws.on("close", () => done(acks));
    setTimeout(() => done(acks), maxMs);
  });
}

console.log("set_preset →", target);
console.log("  acks:", (await wsOne({ type: "set_preset", id: target })).join(" | ") || "(connection dropped during restart — expected)");
await new Promise((r) => setTimeout(r, 8000));
console.log("set_preset →", backTo);
console.log("  acks:", (await wsOne({ type: "set_preset", id: backTo })).join(" | ") || "(dropped)");
await new Promise((r) => setTimeout(r, 8000));
// Confirm via the tool-face REST read: the effective roster should now carry persona-evolution.
const scope = await fetch(`${BASE}/api/mcp-tool-scope`, { headers: { cookie } }).then((r) => r.json()).catch(() => null);
console.log("tool-scope:", scope ? JSON.stringify(scope).slice(0, 160) : "unavailable");
