// Read-back assertion: the enrichment preference must be ON after the A/B restore leg.
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const cur = await fetch(`${BASE}/api/preferences`, { headers: { cookie } }).then((r) => r.json());
const v = cur.preferences?.["tool.description.enrichment"];
console.log("pref tool.description.enrichment =", JSON.stringify(v));
process.exit(v === true || v === undefined ? 0 : 1);
