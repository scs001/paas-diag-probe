// ④4.2 real-machine full chain (add-persona-self-evolution), driven over the
// production edge from a GitHub runner:
//   real turn (WS prompt) → agent lands persona_amend candidate → evaluate
//   (judge lane) → promote → preset materializes with lineage → new cast
//   session reports the amended persona.
// Usage: node scripts/orchestrate-persona.mjs <presetId> <scenarioPrompt>
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
if (!cookie) { console.error("PAAS_COOKIE missing"); process.exit(2); }
const H = { cookie, "content-type": "application/json" };
const PRESET = process.argv[2] ?? "user.preset-3";
const SCENARIO = process.argv[3] ?? "用户问：今天走查进展如何？请简短汇报。";

const rest = async (path, init) => fetch(`${BASE}${path}`, { headers: H, ...init });

const pre = await rest(`/api/agent/presets/${PRESET}`).then((r) => r.json());
if (!pre.preset) { console.error("preset missing:", PRESET, JSON.stringify(pre).slice(0, 120)); process.exit(1); }
console.log("STEP1 preset:", PRESET, "| persona[:40]:", pre.preset.persona.slice(0, 40));

const AMENDED = pre.preset.persona.trim() + " 每次回复末尾附一行「风险提示：走查环境」。";
const prompt =
  `请调用 persona_amend 工具，为自建预设 ${PRESET} 提交一份角色修订候选。` +
  `amendedPersona 全文用：「${AMENDED}」` +
  `evidence 的 source 写「走查回合：回复缺风险提示收尾」，fixed 写「补风险提示收尾」，boundary 写「走查场景」。` +
  `只提交候选，不要做别的。完成后把候选 id 告诉我。`;
console.log("STEP2 real turn via WS (lane-waiting loop)…");
let out = "";
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    out = execSync(`node scripts/realturn.mjs ${JSON.stringify(prompt)} 300`, { env: process.env, encoding: "utf8", timeout: 330_000, cwd: process.cwd() });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  const toolLine = (out.match(/TOOL_CALLS: (.*)/) ?? [])[1] ?? "";
  const finalLine = (out.match(/FINAL: (.*)/) ?? ["", ""])[1] ?? "";
  const called = /(^|,)persona_amend(,|$)/.test(toolLine);
  console.log(`-- attempt ${attempt}: tools=[${toolLine}] called=${called} | ${(out.match(/USAGE: (.*)/) ?? [])[1] ?? "no usage"}`);
  if (finalLine) console.log(`   FINAL: ${finalLine.slice(0, 260)}`);
  if (called) break;
  if (attempt < 6) { console.log("   waiting 90s"); await new Promise((r) => setTimeout(r, 90_000)); }
}
const toolLine2 = (out.match(/TOOL_CALLS: (.*)/) ?? [])[1] ?? "";
if (!/(^|,)persona_amend(,|$)/.test(toolLine2)) { console.log("CHAIN-FAIL: persona_amend never called (see FINAL above — tool face / agent judgement)"); process.exit(3); }
console.log(out.trim().split("\n").map((l) => "  " + l).join("\n"));

console.log("STEP3 poll candidate…");
let cand = null;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const list = await rest(`/api/persona-evolution/candidates?status=candidate`).then((r) => r.json());
  cand = (list.candidates ?? []).find((c) => c.target_ref === PRESET && (c.evidence?.source ?? "").includes("走查回合"));
  if (cand) break;
}
if (!cand) { console.log("CHAIN-FAIL: no candidate landed"); process.exit(1); }
console.log("  candidate:", cand.id, "| current_persona[:30]:", cand.current_persona?.slice(0, 30));

console.log("STEP4 evaluate (judge lane)…");
const ev = await rest(`/api/persona-evolution/candidates/${cand.id}/evaluate`, { method: "POST", body: JSON.stringify({ scenarioPrompt: SCENARIO }) }).then((r) => r.json());
console.log("  passed:", ev.passed, "| reason:", (ev.reason ?? ev.error ?? "").slice(0, 90));
if (ev.passed !== true) { console.log("CHAIN-STOP: gate not green — candidate stays honestly unevaluated"); process.exit(2); }

console.log("STEP5 promote (human key via owner REST)…");
const pm = await rest(`/api/persona-evolution/candidates/${cand.id}/promote`, { method: "POST", body: "{}" }).then((r) => r.json());
console.log("  promote:", JSON.stringify(pm).slice(0, 140));
if (!pm.ok) process.exit(1);

console.log("STEP6 verify materialization + lineage…");
const post = await rest(`/api/agent/presets/${PRESET}`).then((r) => r.json());
const materialized = post.preset.persona.includes("风险提示：走查环境");
console.log("  persona updated:", materialized);
const decided = await rest(`/api/persona-evolution/candidates/${cand.id}`).then((r) => r.json());
const lineage = typeof decided.candidate?.lineage === "string" ? JSON.parse(decided.candidate.lineage) : decided.candidate?.lineage;
console.log("  lineage kind:", lineage?.kind, "| previousPersona kept:", Boolean(lineage?.previousPersona));

console.log("STEP7 new cast session reports the amended persona…");
const sw = execSync(`node scripts/ws-one.mjs set_preset ${JSON.stringify(PRESET)} 60`, { env: process.env, encoding: "utf8", timeout: 90_000, cwd: process.cwd() });
console.log("  set_preset:", sw.trim().split("\n").slice(-1)[0].slice(0, 80));
const q = "用一句话说明你的角色定位，并按角色要求在末尾附上该附的行。";
const t2 = execSync(`node scripts/realturn.mjs ${JSON.stringify(q)} 120`, { env: process.env, encoding: "utf8", timeout: 150_000, cwd: process.cwd() });
console.log(t2.trim().split("\n").map((l) => "  " + l).join("\n"));
const live = t2.includes("风险提示：走查环境");
console.log("CHAIN-VERDICT:", materialized && live ? "FULL PASS (amended persona live in a new cast)" : materialized ? "PARTIAL (materialized; new-cast check failed)" : "FAIL");
fs.writeFileSync("/tmp/persona-chain.json", JSON.stringify({ candidate: cand.id, preset: PRESET, materialized, live, turnUsage: (t2.match(/USAGE: (.*)/) ?? [])[1] ?? null }));
