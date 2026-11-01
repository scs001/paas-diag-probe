// Visibility leg on CURRENT production code: promote → trigger the mirror via
// the existing extensions CRUD route (PUT enable — the only writeSkill caller
// in prod until the promote fix rolls) → focused yes/no turn → cleanup.
import { execSync } from "node:child_process";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const N = `lane-probe-note4-${Date.now().toString(36).slice(-4)}`;
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
const p = await rest("/api/skill-evolution/propose", { method: "POST", body: JSON.stringify({ name: N, description: "走查状态记录法：基线-只追加-复读判定。", body: BODY, evidence: { source: "本轮真实任务", solved: "走查状态记录与恢复判定", boundary: "仅适用于车道探针走查场景" } }) });
console.log("propose:", p.status, p.body?.candidate?.id ?? JSON.stringify(p.body).slice(0, 80));
if (p.status !== 201) process.exit(1);
const cand = (await rest("/api/skill-evolution/candidates")).body?.candidates?.find((c) => c.name === N);
const ev = await rest(`/api/skill-evolution/candidates/${cand.id}/evaluate`, { method: "POST", body: JSON.stringify({ scenarioPrompt: SCENARIO }) });
console.log("evaluate:", ev.status, JSON.stringify({ passed: ev.body?.passed, reason: String(ev.body?.reason ?? "").slice(0, 80) }));
if (!(ev.status === 200 && ev.body?.passed)) process.exit(2);
const pr = await rest(`/api/skill-evolution/candidates/${cand.id}/promote`, { method: "POST" });
console.log("promote:", pr.status, JSON.stringify(pr.body).slice(0, 90));
if (pr.status !== 200) process.exit(2);

// Mirror trigger workaround (prod predates the promote-materialize fix): a
// no-op enable PUT rides the extensions update route, whose handler calls
// skillMaterialize.writeSkill on THIS row.
const skills = await rest("/api/extensions/skills").then((r) => r.body?.skills ?? []);
const row = skills.find((s) => s.name === N && s.source === "database");
console.log("row present in /api/extensions/skills:", !!row);
const put = await rest(`/api/extensions/skills/${encodeURIComponent(N)}`, { method: "PUT", body: JSON.stringify({ name: N, description: "走查状态记录法：基线-只追加-复读判定。", content: BODY, enabled: true }) });
console.log("mirror-trigger PUT:", put.status);
await new Promise((r) => setTimeout(r, 8000)); // chokidar hot-load window

const t = execSync(`node scripts/realturn.mjs ${JSON.stringify(`用一句是/否回答：你当前可用的技能清单里，是否存在名为 ${N} 的技能？是则答「有：<名字>」，否则答「无」。不要执行任何技能。`)} 180`, { env: process.env, encoding: "utf8", timeout: 220_000, cwd: process.cwd() });
console.log(t.trim().split("\n").map((l) => "  " + l).join("\n"));
const finalPart = t.split("FINAL:")[1] ?? "";
const visible = finalPart.includes(N) && /有/.test(finalPart);
console.log("SKILL-VISIBLE:", visible ? `YES — ${N} hot-loaded and live` : "NO");
const d = await rest(`/api/extensions/skills/${encodeURIComponent(N)}`, { method: "DELETE" });
console.log("cleanup:", d.status);
process.exit(visible ? 0 : 1);
