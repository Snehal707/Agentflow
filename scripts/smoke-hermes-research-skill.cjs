#!/usr/bin/env node
/**
 * Smoke: Hermes Agent can see agentflow-report-research via skills_list.
 * Requires local Hermes (AGENTFLOW_HERMES_URL) with skills toolset allowed.
 */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const base = (process.env.AGENTFLOW_HERMES_URL || "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);
const key =
  process.env.AGENTFLOW_BRAIN_INTERNAL_KEY ||
  process.env.API_SERVER_KEY ||
  process.env.HERMES_API_SERVER_KEY ||
  "";

function headers() {
  const out = { "Content-Type": "application/json" };
  if (key) {
    out.Authorization = `Bearer ${key}`;
  }
  return out;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const health = await fetch(`${base}/health`, { headers: headers() });
  if (!health.ok) {
    throw new Error(`Hermes health failed: ${health.status}`);
  }
  console.log(`[smoke] health OK ${base}`);

  const start = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      input:
        "Call skills_list now. Reply with ONLY the skill name agentflow-report-research if it appears in the list, otherwise reply MISSING.",
      instructions:
        "You must call the skills_list tool before answering. Do not invent skill names. After the tool result, answer with exactly one token: agentflow-report-research or MISSING.",
      session_id: `skill-install-smoke-${Date.now()}`,
      enabled_toolsets: ["agentflow_brain", "skills"],
    }),
  });
  const startText = await start.text();
  if (!start.ok) {
    throw new Error(`run create failed ${start.status}: ${startText.slice(0, 500)}`);
  }
  const { run_id: runId } = JSON.parse(startText);
  if (!runId) {
    throw new Error(`no run_id in ${startText.slice(0, 300)}`);
  }
  console.log(`[smoke] run ${runId}`);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const statusRes = await fetch(`${base}/v1/runs/${runId}`, { headers: headers() });
    const body = await statusRes.json();
    const status = String(body.status || "").toLowerCase();
    if (status === "completed" || status === "failed" || status === "cancelled") {
      const output = String(body.output || body.error || "");
      console.log(`[smoke] status=${status}`);
      console.log(`[smoke] output=${output.slice(0, 800)}`);
      const pass =
        /agentflow-report-research/i.test(output) && !/\bMISSING\b/.test(output);
      if (!pass) {
        process.exitCode = 3;
        console.error("[smoke] FAIL: skill name not confirmed in Hermes output");
        return;
      }
      console.log("[smoke] PASS: Hermes Agent listed agentflow-report-research");
      return;
    }
    process.stdout.write(".");
  }
  throw new Error("timed out waiting for Hermes run");
}

main().catch((error) => {
  console.error("[smoke] FAIL:", error.message || error);
  process.exit(1);
});
