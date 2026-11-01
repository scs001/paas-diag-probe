// Final chain verification: materialized persona + live new-cast check.
import { execSync } from "node:child_process";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const PRESET = process.argv[2] ?? "user.preset-3";

const p = await fetch(`${BASE}/api/agent/presets/${PRESET}`, { headers: H }).then((r) => r.json());
console.log("persona now:", (p.preset?.persona ?? "").slice(0, 90));
console.log("MATERIALIZED:", p.preset?.persona?.includes("探针 OK") ? "YES" : "NO");

// Switch the live runtime onto the amended persona (recomposition rides the switch).
const sw = execSync(`node scripts/ws-one.mjs set_preset ${JSON.stringify(PRESET)} 90`, { env: process.env, encoding: "utf8", timeout: 120_000, cwd: process.cwd() });
console.log("set_preset:", sw.trim().slice(0, 100));

// New cast session: ask the agent to state its role.
const t = execSync(`node scripts/realturn.mjs "用一句话说明你的角色定位，并按你的角色要求在末尾附上该附的行。" 180`, { env: process.env, encoding: "utf8", timeout: 200_000, cwd: process.cwd() });
console.log(t.trim().split("\n").map((l) => "  " + l).join("\n"));
const live = t.includes("探针 OK");
console.log("LIVE-CHECK:", live ? "PASS — the amended persona is live in a new cast" : "FAIL (see FINAL)");
process.exit(live ? 0 : 1);
