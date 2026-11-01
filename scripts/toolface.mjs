// Tool-face inspector: what does the deployment think the effective MCP tool
// face is? Hits /api/mcp-tool-scope (the full-surface escape-hatch read) and
// the extensions list, printing the persona-evolution row's posture.
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie };
const scope = await fetch(`${BASE}/api/mcp-tool-scope`, { headers: H }).then((r) => r.json()).catch((e) => ({ error: String(e).slice(0, 120) }));
console.log("mcp-tool-scope keys:", Object.keys(scope).join(","));
const servers = scope.servers ?? scope;
const pe = Array.isArray(servers) ? servers.find((s) => s.name === "persona-evolution") : null;
console.log("persona-evolution in scope:", pe ? JSON.stringify(pe).slice(0, 200) : "ABSENT");
if (Array.isArray(servers)) console.log("scope server names:", servers.map((s) => s.name).join(","));
const ext = await fetch(`${BASE}/api/extensions/mcp`, { headers: H }).then((r) => r.json()).catch(() => ({}));
const row = (ext.servers ?? []).find((s) => s.name === "persona-evolution");
console.log("extensions row:", row ? JSON.stringify({ enabled: row.enabled, origin: row.origin, config: { command: row.config?.command, args: row.config?.args } }).slice(0, 220) : "ABSENT");
// What skill-evolution looks like (the working precedent) for comparison.
const se = (ext.servers ?? []).find((s) => s.name === "skill-evolution");
console.log("skill-evolution row (precedent):", se ? JSON.stringify({ enabled: se.enabled, origin: se.origin }).slice(0, 120) : "ABSENT");
