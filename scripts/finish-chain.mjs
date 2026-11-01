// Finish the persona chain for an already-landed candidate: evaluate →
// promote → verify materialization+lineage → new-cast live check.
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const PRESET = process.argv[2] ?? "user.preset-3";
const list = await fetch(`${BASE}/api/persona-evolution/candidates`, { headers: H }).then((r) => r.json());
const cands = (list.candidates ?? []).filter((c) => ["candidate", "evaluated"].includes(c.status));
console.log("all open:", (list.candidates ?? []).slice(0, 6).map((c) => `${c.id}|${c.target_ref}|${c.status}|${(c.evidence?.source ?? "").slice(0, 24)}`).join(" ;; ") || "(none)");
console.log("open candidates for", PRESET, ":", cands.map((c) => `${c.id}(${c.status})`).join(", ") || "(none)");
if (!cands.length) process.exit(1);
const cand = cands[0];
console.log("using:", cand.id, "| evidence.source:", cand.evidence?.source);
const ev = await fetch(`${BASE}/api/persona-evolution/candidates/${cand.id}/evaluate`, { method: "POST", headers: H, body: JSON.stringify({ scenarioPrompt: "用户问：今天走查进展如何？请简短汇报。" }) }).then((r) => r.json());
console.log("evaluate:", JSON.stringify({ passed: ev.passed, reason: (ev.reason ?? ev.error ?? "").slice(0, 80) }));
if (ev.passed !== true) { console.log("gate not green — stopping honestly"); process.exit(2); }
const pm = await fetch(`${BASE}/api/persona-evolution/candidates/${cand.id}/promote`, { method: "POST", headers: H, body: "{}" }).then((r) => r.json());
console.log("promote:", JSON.stringify(pm).slice(0, 140));
const post = await fetch(`${BASE}/api/agent/presets/${PRESET}`, { headers: H }).then((r) => r.json());
const materialized = post.preset?.persona?.includes("风险提示：走查环境");
console.log("persona materialized:", materialized);
const decided = await fetch(`${BASE}/api/persona-evolution/candidates/${cand.id}`, { headers: H }).then((r) => r.json());
const lineage = typeof decided.candidate?.lineage === "string" ? JSON.parse(decided.candidate.lineage) : decided.candidate?.lineage;
console.log("lineage:", JSON.stringify(lineage ?? null).slice(0, 140));
fs = await import("node:fs");
fs.writeFileSync("/tmp/persona-chain.json", JSON.stringify({ candidate: cand.id, materialized, lineage: lineage?.kind ?? null }));
