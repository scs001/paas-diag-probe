// Restore the enrichment preference + recompose (the A/B run crashed after
// Flip OFF, before its Restore step — production-state hygiene first).
const BASE = "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const put = await fetch(`${BASE}/api/preferences`, { method: "PUT", headers: H, body: JSON.stringify({ key: "tool.description.enrichment", value: true }) });
console.log("restore pref:", put.status);
const after = await fetch(`${BASE}/api/preferences`, { headers: { cookie } }).then((r) => r.json());
console.log("pref now:", JSON.stringify(after.preferences?.["tool.description.enrichment"]));
// Recompose: switching preset re-runs writeMcpPatch (deletes the OFF overlay).
const sp = await fetch(`${BASE.replace(/^http/, "ws")}`); // noop placeholder; set_preset rides WS below
process.exit(0);
