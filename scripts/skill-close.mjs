// skill-self-evolution 4.3 close-out: the v1 probe candidate honestly FAILED
// the gate ("control ranked best") — the judge lane is intermittently alive
// and the gate has real discriminative power. This script proposes a genuinely
// useful candidate (structured output template), evaluates with retry, and on
// a green gate completes: promote → new-cast visibility → supersedes lineage
// (v2) → cleanup of the promoted rows (probe residue; candidates stay as
// audit). Usage: node scripts/skill-close.mjs
import { execSync } from "node:child_process";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const N1 = `lane-probe-note2-${Date.now().toString(36).slice(-4)}`;
const N2 = `${N1}-next`;
const SCENARIO = "车道探针走查员需要记录每轮检查的基线状态与恢复判定，供下一轮走查接续比对。请生成这样一份走查状态记录。";

const BODY = `走查状态记录法（可复现接续比对）

适用：对同一组检查项做多轮走查，需要判定「已恢复 / 仍异常」并交给下一轮接续。

步骤：
1. 建基线：首轮对每个检查项记录四字段「项 | 返回值 | 时间戳 | 原始错误」；失败项必须保留原文错误，不改写、不摘要。
2. 只追加：后续每轮仅追加新行，禁止修改或合并历史行；固定格式「时间 | 项 | 结果 | 备注」。
3. 复读判定：收尾重读全部记录，对每个曾失败项输出「已恢复 / 仍异常」，并附最近两条记录作为证据。

输出模板：
[基线] 项=<A> 返回值=<...> ts=<...>
[第2轮] 13:52 | A | 仍异常 | 502 timeout x4
判定：A 已恢复 / B 仍异常（证据行：<ts1>、<ts2>）`;

const rest = (path, opts = {}) => fetch(`${BASE}${path}`, { headers: H, ...opts }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function propose(name, supersedes) {
  const p = await rest("/api/skill-evolution/propose", { method: "POST", body: JSON.stringify({ name, description: "走查状态记录法：基线-只追加-复读判定，供接续比对。", body: BODY, evidence: { source: "本轮真实任务", solved: "车道探针走查中的状态记录与恢复判定", boundary: "仅适用于车道探针走查场景" }, ...(supersedes ? { supersedes } : {}) }) });
  console.log("propose", name, ":", p.status, JSON.stringify(p.body).slice(0, 110));
  if (p.status !== 201) return null;
  return (await rest("/api/skill-evolution/candidates")).body?.candidates?.find((c) => c.name === name && c.status === "candidate");
}

async function evaluate(id, label, attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    const ev = await rest(`/api/skill-evolution/candidates/${id}/evaluate`, { method: "POST", body: JSON.stringify({ scenarioPrompt: SCENARIO }) });
    console.log(`evaluate ${label} attempt ${i}:`, ev.status, JSON.stringify({ passed: ev.body?.passed, reason: String(ev.body?.reason ?? ev.body?.error ?? "").slice(0, 90) }));
    if (ev.status === 200 && ev.body?.passed === true) return true;
    if (ev.status === 409) return false;
    if (ev.status === 200) return false; // honest red verdict — do not retry content
    if (i < attempts) await sleep(25000 * i);
  }
  return false;
}

function turn(prompt, maxSec = 240) {
  return execSync(`node scripts/realturn.mjs ${JSON.stringify(prompt)} ${maxSec}`, { env: process.env, encoding: "utf8", timeout: (maxSec + 30) * 1000, cwd: process.cwd() });
}

// Leg 0: standard preset (full surface) — same-connection id-matched ack.
import WebSocket from "ws";
{
  const target = "standard";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const got = await new Promise((resolve) => {
      const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { cookie } });
      let done = false;
      const fin = (v) => { if (!done) { done = true; try { ws.close(); } catch {} resolve(v); } };
      ws.on("open", () => ws.send(JSON.stringify({ type: "set_preset", id: target })));
      ws.on("message", (raw) => { let d; try { d = JSON.parse(raw.toString()); } catch { return; } if (d.type === "current_preset" && d.id === target) fin({ ok: true }); else if (d.type === "error") fin({ ok: false, err: d.message }); });
      ws.on("error", () => fin({ ok: false, err: "drop" }));
      setTimeout(() => fin({ ok: false, err: "timeout" }), 45_000);
    });
    console.log(`set_preset standard attempt ${attempt}:`, got.ok ? "confirmed" : `(${got.err})`);
    if (got.ok) break;
    await sleep(5000);
  }
}

// Leg A: propose + evaluate + promote C1.
const c1 = await propose(N1, null);
if (!c1) process.exit(1);
const ok1 = await evaluate(c1.id, "C1");
if (!ok1) { console.log("C1 gate not green — stopping honestly (gate discrimination already proven)"); process.exit(2); }
const pr1 = await rest(`/api/skill-evolution/candidates/${c1.id}/promote`, { method: "POST" });
console.log("promote C1:", pr1.status, JSON.stringify(pr1.body).slice(0, 120));
if (pr1.status !== 200) process.exit(2);

// Leg B: new-cast turn must see the promoted skill.
const t = turn("列出你当前可用的技能名字。只需要名字列表，不要执行任何技能。");
console.log(t.trim().split("\n").map((l) => "  " + l).join("\n"));
const visible = t.includes(N1);
console.log("SKILL-VISIBLE:", visible ? `YES — ${N1} live in the tool face` : "NO");

// Leg C: v2 supersedes v1 → lineage stamped (no read face exposes the column —
// verified via promote semantics + both rows present; recorded as a gap).
const c2 = await propose(N2, N1);
if (!c2) process.exit(1);
const ok2 = await evaluate(c2.id, "C2");
if (ok2) {
  const pr2 = await rest(`/api/skill-evolution/candidates/${c2.id}/promote`, { method: "POST" });
  console.log("promote C2 (supersedes):", pr2.status, JSON.stringify(pr2.body).slice(0, 120));
} else console.log("C2 gate red — lineage leg incomplete, recorded honestly");

// Cleanup: remove the promoted probe skills from the user's roster (the
// materializer drops them on the next CRUD broadcast; candidates stay).
for (const n of [N1, N2]) {
  const d = await rest(`/api/extensions/skills/${encodeURIComponent(n)}`, { method: "DELETE" });
  console.log(`cleanup ${n}:`, d.status);
}
console.log("CHAIN-DONE", { c1: c1.id, visible, c2: c2?.id, c2Promoted: ok2 });
