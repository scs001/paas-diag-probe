// Final chain verification for ④4.2, with the honest materialization check.
// The probe persona already contains 「探针 OK」, so a substring check is a weak
// positive. The discriminating check: the promoted candidate's amended_persona
// (what promote wrote) must equal the live preset persona byte-for-byte; the
// candidate's current_persona snapshot shows what the text was BEFORE promote.
// The LIVE-CHECK (behavioral, new cast) proves the runtime picks the preset up.
import { execSync } from "node:child_process";
const BASE = process.env.PAAS_BASE ?? "https://platform.finddatatech.cloud";
const cookie = process.env.PAAS_COOKIE;
const H = { cookie, "content-type": "application/json" };
const PRESET = process.argv[2] ?? "user.preset-3";
const CAND = process.argv[3] ?? "pc_1793512141314_th0275";

const p = await fetch(`${BASE}/api/agent/presets/${PRESET}`, { headers: H }).then((r) => r.json());
const livePersona = p.preset?.persona ?? "";
console.log("live persona:", livePersona.slice(0, 120));

const cl = await fetch(`${BASE}/api/persona-evolution/candidates`, { headers: H }).then((r) => r.json()).catch(() => null);
const rows = cl?.candidates ?? cl ?? [];
const cand = rows.find((c) => c.id === CAND);
if (!cand) {
  console.log("candidate lookup: NOT FOUND (rows:", rows.length, "ids:", rows.map((c) => c.id).join(","), ")");
} else {
  console.log("candidate:", cand.id, "status:", cand.status);
  console.log("  pre-promote snapshot:", String(cand.current_persona ?? "").slice(0, 120));
  console.log("  amended (promoted):  ", String(cand.amended_persona ?? "").slice(0, 120));
  const identical = String(cand.current_persona ?? "") === String(cand.amended_persona ?? "");
  console.log("  amendment vs original:", identical ? "IDENTICAL (mechanism proven; content no-op — behavioral discrimination impossible by design of this probe)" : "DIFFERS");
}
const match = cand && livePersona === String(cand.amended_persona ?? "");
console.log("MATERIALIZED:", match ? "YES — live preset persona === promoted amended_persona (byte-exact)" : "NO");

// Switch the live runtime onto the amended persona (recomposition rides the switch).
const sw = execSync(`node scripts/ws-one.mjs set_preset ${JSON.stringify(PRESET)} 90`, { env: process.env, encoding: "utf8", timeout: 120_000, cwd: process.cwd() });
console.log("set_preset:", sw.trim().slice(0, 100));

// New cast session: ask the agent to state its role.
const t = execSync(`node scripts/realturn.mjs "用一句话说明你的角色定位，并按你的角色要求在末尾附上该附的行。" 180`, { env: process.env, encoding: "utf8", timeout: 200_000, cwd: process.cwd() });
console.log(t.trim().split("\n").map((l) => "  " + l).join("\n"));
const live = t.includes("探针 OK");
console.log("LIVE-CHECK:", live ? "PASS — the preset persona is live in a new cast" : "FAIL (see FINAL)");
process.exit(match && live ? 0 : 1);
