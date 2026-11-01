// Lane-independent leg of skill-self-evolution 4.3: owner-side propose →
// reject (terminal + audited) → re-promote refused 409. Runs even when the
// judge lane is down.
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const NAME = `lane-probe-doomed-${Date.now().toString(36).slice(-4)}`;
const rest = (path, opts = {}) => fetch(`${BASE}${path}`, { headers: H, ...opts }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const p = await rest("/api/skill-evolution/propose", { method: "POST", body: JSON.stringify({ name: NAME, description: "驳回终结演练：验证驳回即终结。", body: "走查状态记录做法：\n1. 取基线：记录检查项的返回值与时间戳，失败时保留原始错误文本。\n2. 追加记录：每轮只追加固定四字段（时间、项、结果、备注），不改写历史行。\n3. 收尾比对：复读全部记录并输出「已恢复 / 仍异常」判定。\n（本候选仅为驳回终结演练而创建。）", evidence: { source: "owner-side probe", solved: "驳回终结路径" } }) });
console.log("owner-side propose:", p.status, JSON.stringify(p.body).slice(0, 110));
const cand = (await rest("/api/skill-evolution/candidates")).body?.candidates?.find((c) => c.name === NAME && c.status === "candidate");
if (!cand) { console.log("candidate not found — stop"); process.exit(1); }
console.log("candidate:", cand.id, "proposedBy:", cand.proposed_by);
const rj = await rest(`/api/skill-evolution/candidates/${cand.id}/reject`, { method: "POST", body: JSON.stringify({ reason: "驳回终结演练（走查残留，如实终结）" }) });
console.log("reject:", rj.status, JSON.stringify(rj.body).slice(0, 110));
const again = await rest(`/api/skill-evolution/candidates/${cand.id}/promote`, { method: "POST" });
console.log("re-promote after reject:", again.status, again.status === 409 ? "REFUSED as designed" : "UNEXPECTED");
const ev = await rest(`/api/skill-evolution/candidates/${cand.id}/evaluate`, { method: "POST", body: JSON.stringify({ scenarioPrompt: "x" }) });
console.log("re-evaluate after reject:", ev.status, ev.status === 409 ? "REFUSED as designed" : "UNEXPECTED");
process.exit(again.status === 409 ? 0 : 1);
