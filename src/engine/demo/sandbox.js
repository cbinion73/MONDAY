const { resolveMondayEngine } = require("..");
const { createEngineState } = require("../schema");
const {
  enforceRuntimeContract,
} = require("../contract/runtime-contract-enforcer");
const {
  translateMondayVoice,
} = require("../voice/voice-translator");
const {
  materializeWorkspace,
} = require("../workspace/workspace-materializer");
const { scenarios } = require("./scenarios");

function runScenario(name) {
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(`Unknown scenario '${name}'.`);
  }

  console.log(`\n=== Monday Sandbox: ${scenario.title} ===\n`);

  for (const step of scenario.steps) {
    const initialState = step.overrideState
      ? createEngineState(step.overrideState)
      : resolveMondayEngine(step.input, step.context);

    const enforced = enforceRuntimeContract({
      engineState: initialState,
      context: step.context,
    });

    const voice = translateMondayVoice({
      engineState: enforced.engineState,
      truth: step.truth,
    });

    const workspace = materializeWorkspace({
      engineState: enforced.engineState,
      truth: step.truth,
    });

    renderStep({
      label: step.label,
      input: step.input,
      initialState,
      enforced,
      voice,
      workspace,
    });
  }
}

function renderStep({
  label,
  input,
  initialState,
  enforced,
  voice,
  workspace,
}) {
  console.log(`--- ${label} ---`);
  console.log(`User: ${input}\n`);

  console.log("Engine State:");
  console.log(
    [
      `  significance: ${initialState.significance}`,
      `  classification: ${initialState.situationClassification}`,
      `  active_role: ${initialState.activeRole}`,
      `  secondary_role: ${initialState.secondaryRole || "none"}`,
      `  outcome: ${initialState.recommendedOutcome}`,
    ].join("\n")
  );

  if (
    initialState.activeRole !== enforced.engineState.activeRole ||
    initialState.recommendedOutcome !== enforced.engineState.recommendedOutcome
  ) {
    console.log("\nContract Enforcement:");
    console.log(
      [
        `  final_active_role: ${enforced.engineState.activeRole}`,
        `  final_secondary_role: ${enforced.engineState.secondaryRole || "none"}`,
        `  final_outcome: ${enforced.engineState.recommendedOutcome}`,
      ].join("\n")
    );
  }

  if (enforced.adjustments.length > 0 || enforced.blocked.length > 0) {
    console.log("\nContract Notes:");
    for (const line of [...enforced.adjustments, ...enforced.blocked]) {
      console.log(`  - ${line}`);
    }
  }

  console.log(`\nMonday (${voice.voiceMode}):`);
  for (const line of voice.lines) {
    console.log(`  ${line}`);
  }

  console.log("\nWorkspace:");
  console.log(
    [
      `  mode: ${workspace.workspaceMode}`,
      `  support_intent: ${workspace.supportIntent}`,
      `  answer_required_first: ${workspace.answerRequiredFirst}`,
    ].join("\n")
  );
  for (const section of workspace.sections) {
    console.log(`  - ${section.key}: ${section.summary}`);
  }

  console.log("\nWhy this role:");
  const explanations = enforced.engineState.explanation || [];
  for (const line of explanations.slice(0, 5)) {
    console.log(`  - ${line}`);
  }
  console.log("");
}

function main() {
  const scenarioName = process.argv[2] || "summer-camp";
  if (scenarioName === "all") {
    Object.keys(scenarios).forEach(runScenario);
    return;
  }
  runScenario(scenarioName);
}

main();
