// Live-cast check on ONE WS connection per phase:
//   1) list_presets → the roster carries ROSTER-form ids (dotted DB id
//      `user.preset-3` folds to `user-preset-3` via rosterPresetId) — match
//      the target flexibly instead of guessing the form.
//   2) set_preset with the ROSTER id → await ack whose id MATCHES the request
//      (the server pushes current state on open, which races a naive ack).
//   3) prompt turn → inspect tail text for the persona marker.
// Usage: node scripts/live-check.mjs [presetIdPattern=user.preset-3]
import WebSocket from "ws";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const pattern = process.argv[2] ?? "user.preset-3";
const want = pattern.replace(/[^a-z0-9]+/gi, "[-.]"); // match either id form
const prompt = "用一句话说明你的角色定位，并按你的角色要求在末尾附上该附的行。";

function connect() { return new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } }); }
const recv = (ws, test, ms) => new Promise((resolve) => {
  const out = [];
  const fin = (v) => { try { ws.close(); } catch {} resolve(v); };
  ws.on("message", (raw) => {
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    if (test(d)) out.push(d);
    if (out.length) fin(out);
  });
  setTimeout(() => fin(out), ms);
  ws.on("error", () => fin(out));
});

// Phase 1: roster.
{
  const ws = connect();
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ type: "list_presets" }));
  const msgs = await recv(ws, (d) => d.type === "presets" || d.type === "error", 20_000);
  const roster = msgs.find((d) => d.type === "presets")?.presets ?? [];
  console.log("ROSTER:", roster.map((p) => p.id).join(","));
  var target = roster.find((p) => new RegExp(`^${want}$`, "i").test(p.id));
  if (!target) { console.log(`ROSTER-MISS: no roster id matches /${want}/ — aborting`); process.exit(1); }
  console.log("TARGET roster id:", target.id, target.broken ? `(broken: ${target.broken})` : "");
}

// Phase 2: set_preset with the roster id; tolerate one restart drop (reconnect
// and just confirm the current push names the target).
let switched = false;
for (let attempt = 1; attempt <= 2 && !switched; attempt++) {
  const got = await new Promise((resolve) => {
    const ws = connect();
    let done = false;
    const fin = (v) => { if (!done) { done = true; try { ws.close(); } catch {} resolve(v); } };
    ws.on("open", () => ws.send(JSON.stringify({ type: "set_preset", id: target.id })));
    ws.on("message", (raw) => {
      let d; try { d = JSON.parse(raw.toString()); } catch { return; }
      if (d.type === "current_preset" && d.id === target.id) fin({ ok: true });
      else if (d.type === "current_preset") { /* on-open push of the OLD state — keep waiting */ }
      else if (d.type === "error") fin({ ok: false, err: d.message });
    });
    ws.on("error", () => fin({ ok: false, err: "drop" }));
    setTimeout(() => fin({ ok: false, err: "timeout" }), 45_000);
  });
  console.log(`set_preset attempt ${attempt}:`, got.ok ? `confirmed id=${target.id}` : `(${got.err})`);
  if (got.ok) { switched = true; break; }
  await new Promise((r) => setTimeout(r, 5000));
  // After a drop, verify via a fresh connection's on-open push instead of blind retry.
  const ws2 = connect();
  const push = await recv(ws2, (d) => d.type === "current_preset", 15_000);
  const cur = push[0]?.id;
  console.log("post-drop current_preset push:", cur ?? "(none)");
  if (cur === target.id) { switched = true; break; }
}
if (!switched) { console.log("SWITCH: FAILED"); process.exit(1); }
await new Promise((r) => setTimeout(r, 6000));

// Phase 3: probe turn.
{
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
}
