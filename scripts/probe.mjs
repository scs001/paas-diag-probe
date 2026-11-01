// Production judge-lane probe (add-persona-self-evolution evaluate face).
// Run on GitHub runners: node scripts/probe.mjs <candidateId?> — with an id it
// re-evaluates that candidate; without one it creates a disposable preset +
// candidate first. The verdict line is the machine-readable outcome:
//   VERDICT: LANE=UP (judge ranked a verdict) | DOWN (<reason>)
const BASE = "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
if (!cookie) { console.error("PAAS_COOKIE secret missing"); process.exit(2); }
const H = { cookie, "content-type": "application/json" };
const reEval = process.argv[2] ?? null;

if (reEval) {
  const ev = await fetch(`${BASE}/api/persona-evolution/candidates/${reEval}/evaluate`, { method: "POST", headers: H, body: JSON.stringify({ scenarioPrompt: "用户问：今天走查进展如何？请简短汇报。" }) });
  const ed = await ev.json().catch(() => ({}));
  console.log("re-evaluate:", ev.status, "| passed:", ed.passed, "| reason:", (ed.reason ?? ed.error ?? "").slice(0, 110));
  console.log("VERDICT: LANE=" + (ed.passed === true || ed.passed === false ? "UP (judge returned a verdict)" : "DOWN (" + (ed.reason ?? ed.error ?? ev.status) + ")"));
  process.exit(0);
}

const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })
  .then((r) => r.json()).catch((e) => ({ error: String(e).slice(0, 120) }));
console.log("auth:", me.authenticated, me.email ?? JSON.stringify(me).slice(0, 140));
if (!me.authenticated) { console.log("VERDICT: session-cookie rejected at edge"); process.exit(0); }

const cr = await fetch(`${BASE}/api/agent/presets`, { method: "POST", headers: H,
  body: JSON.stringify({ name: "车道探针-可删", persona: "你是车道探针岗。回答保持简短并报告当前状态，末尾附一行「探针 OK」标记。遇到不确定先确认。", skills: [], mcpServers: [], tags: ["walktest"] }) });
const p = await cr.json();
console.log("preset:", cr.status, p.preset?.id ?? p.error);
if (!p.preset) process.exit(0);

const pr = await fetch(`${BASE}/api/persona-evolution/propose`, { method: "POST", headers: H,
  body: JSON.stringify({ targetKind: "preset", targetRef: p.preset.id,
    amendedPersona: "你是车道探针岗。回答保持简短并报告当前状态，末尾附一行「探针 OK」标记。遇到不确定先确认。",
    evidence: { source: "车道探针：基线缺探针标记", fixed: "补探针标记", boundary: "探针场景" } }) });
const cd = await pr.json();
console.log("propose:", pr.status, cd.candidate?.id ?? cd.error);
if (!cd.candidate) process.exit(0);

const ev = await fetch(`${BASE}/api/persona-evolution/candidates/${cd.candidate.id}/evaluate`, { method: "POST", headers: H,
  body: JSON.stringify({ scenarioPrompt: "用户问：今天走查进展如何？请简短汇报。" }) });
const ed = await ev.json().catch(() => ({}));
console.log("evaluate:", ev.status, "| passed:", ed.passed, "| reason:", (ed.reason ?? ed.error ?? "").slice(0, 110));
console.log("VERDICT: LANE=" + (ed.passed === true || ed.passed === false ? "UP (judge returned a verdict)" : "DOWN (" + (ed.reason ?? ed.error ?? ev.status) + ")"));
