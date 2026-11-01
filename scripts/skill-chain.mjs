// skill-self-evolution 4.3/4.4 real-machine chain (task book: 真实回合→
// skill_propose→A/B→过门→接受→下回合工具面见新技能→supersedes lineage→驳回终结).
// Legs:
//   1. WS turn: instruct the agent to land a skill_propose candidate (v1).
//   2. REST evaluate (judge lane; honest retry on lane errors).
//   3. REST promote (human key) → custom_skills row, materializer hot-loads.
//   4. WS turn: ask the agent to name its skills — the promoted skill must appear.
//   5. WS turn: propose v2 with supersedes=v1 → evaluate → promote → lineage
//      check via /api/skills (old row carries evolution_lineage).
//   6. REST propose (owner-side guard test) + reject → terminal; re-promote
//      refused 409.
// Usage samples of every WS turn are printed for 4.4's cost accounting.
import { execSync } from "node:child_process";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const V1 = process.argv[2] ?? "lane-probe-note";
const V2 = `${V1}-v2`;

const rest = (path, opts = {}) => fetch(`${BASE}${path}`, { headers: H, ...opts }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

function turn(prompt, maxSec = 240) {
  return execSync(`node scripts/realturn.mjs ${JSON.stringify(prompt)} ${maxSec}`, { env: process.env, encoding: "utf8", timeout: (maxSec + 30) * 1000, cwd: process.cwd() });
}

function laneWait(label, fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const out = fn();
      console.log(`-- ${label} attempt ${i}: OK`);
      return out;
    } catch (e) {
      const msg = String(e.message ?? e).slice(0, 120);
      console.log(`-- ${label} attempt ${i}: ${msg}`);
      if (i === attempts) throw new Error(`${label} exhausted`);
      const backoff = 13000 * i;
      console.log(`   backoff ${backoff}ms (lane flakiness)`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, Date.now() + backoff);
    }
  }
}

// ── Leg 1: propose v1 via a real turn ──
console.log("== Leg 1: real turn → skill_propose (v1) ==");
const t1 = laneWait("turn1", () => turn(
  `用 skill_propose 工具提交一个技能候选：名字 ${V1}，描述一句话说明它是什么；正文给出三步以内可执行的做法；证据 evidence.source 写「本轮真实任务」，evidence.solved 写「车道探针走查中的状态记录」，evidence.boundary 写「仅适用于车道探针走查场景」。提交后告诉我候选 id。`));
console.log(t1.trim().split("\n").map((l) => "  " + l).join("\n"));

const cl1 = await rest("/api/skill-evolution/candidates");
const rows1 = cl1.body?.candidates ?? [];
const cand1 = rows1.filter((c) => c.name === V1).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
console.log("candidate v1:", cand1 ? `${cand1.id} status=${cand1.status} evidence=${JSON.stringify(cand1.evidence).slice(0, 120)}` : "NOT FOUND");
if (!cand1) process.exit(1);

// ── Leg 2: evaluate (judge lane) ──
console.log("== Leg 2: evaluate v1 (judge lane) ==");
const ev1 = await rest(`/api/skill-evolution/candidates/${cand1.id}/evaluate`, { method: "POST" });
console.log("evaluate v1:", ev1.status, JSON.stringify({ passed: ev1.body?.passed, reason: String(ev1.body?.reason ?? ev1.body?.error ?? "").slice(0, 100) }));
if (!ev1.body?.passed) { console.log("gate not green — stopping honestly"); process.exit(2); }

// ── Leg 3: promote (human key) ──
const pr1 = await rest(`/api/skill-evolution/candidates/${cand1.id}/promote`, { method: "POST" });
console.log("promote v1:", pr1.status, JSON.stringify(pr1.body).slice(0, 120));

// ── Leg 4: next turn sees the new skill ──
console.log("== Leg 4: new-cast turn must see the promoted skill ==");
const t2 = laneWait("turn2", () => turn(`列出你当前可用的技能名字。只需要名字列表，不要执行任何技能。`));
console.log(t2.trim().split("\n").map((l) => "  " + l).join("\n"));
const seen = t2.includes(V1);
console.log("SKILL-VISIBLE:", seen ? "YES — promoted skill is live in the tool face" : "NO");

// ── Leg 5: supersedes lineage ──
console.log("== Leg 5: v2 supersedes v1 → lineage ==");
const t3 = laneWait("turn3", () => turn(
  `用 skill_propose 工具提交一个技能候选：名字 ${V2}，它是对既有技能 ${V1} 的改进版，因此 supersedes 参数填 "${V1}"；描述写改进点；正文给出三步以内可执行的做法；证据 evidence.source 写「本轮真实任务」，evidence.solved 写「技能改进演练」，evidence.boundary 写「仅适用于车道探针走查场景」。提交后告诉我候选 id。`));
console.log(t3.trim().split("\n").map((l) => "  " + l).join("\n"));
const cl2 = await rest("/api/skill-evolution/candidates");
const cand2 = (cl2.body?.candidates ?? []).filter((c) => c.name === V2).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
console.log("candidate v2:", cand2 ? `${cand2.id} status=${cand2.status} supersedes=${cand2.supersedes}` : "NOT FOUND");
if (!cand2) process.exit(1);
const ev2 = await rest(`/api/skill-evolution/candidates/${cand2.id}/evaluate`, { method: "POST" });
console.log("evaluate v2:", ev2.status, JSON.stringify({ passed: ev2.body?.passed, reason: String(ev2.body?.reason ?? ev2.body?.error ?? "").slice(0, 100) }));
if (!ev2.body?.passed) { console.log("gate not green — stopping honestly"); process.exit(2); }
const pr2 = await rest(`/api/skill-evolution/candidates/${cand2.id}/promote`, { method: "POST" });
console.log("promote v2:", pr2.status, JSON.stringify(pr2.body).slice(0, 120));
const sk = await rest("/api/skills");
const all = sk.body?.skills ?? sk.body ?? [];
const oldRow = Array.isArray(all) ? all.find((s) => s.name === V1) : null;
console.log("lineage on old row:", oldRow ? String(oldRow.evolution_lineage ?? "(none)").slice(0, 200) : `row ${V1} not in /api/skills (${Array.isArray(all) ? all.length : "?"} rows)`);

// ── Leg 6: reject is terminal ──
console.log("== Leg 6: reject leg ==");
const r3 = await rest("/api/skill-evolution/propose", { method: "POST", body: JSON.stringify({ name: `${V1}-doomed`, description: "驳回终结演练", body: "这个候选只会被驳回：验证驳回即终结。", evidence: { source: "owner-side probe", solved: "驳回终结路径" } }) });
console.log("owner-side propose:", r3.status, JSON.stringify(r3.body).slice(0, 100));
const cand3 = (await rest("/api/skill-evolution/candidates")).body?.candidates?.find((c) => c.name === `${V1}-doomed` && c.status === "candidate");
if (cand3) {
  const rj = await rest(`/api/skill-evolution/candidates/${cand3.id}/reject`, { method: "POST", body: JSON.stringify({ reason: "驳回终结演练（走查残留）" }) });
  console.log("reject:", rj.status, JSON.stringify(rj.body).slice(0, 100));
  const again = await rest(`/api/skill-evolution/candidates/${cand3.id}/promote`, { method: "POST" });
  console.log("re-promote after reject (expect 409):", again.status);
} else console.log("doomed candidate not found (owner-side propose may be gated) — reject leg skipped");

console.log("CHAIN-DONE", { v1: cand1.id, v2: cand2?.id, skillVisible: seen });
