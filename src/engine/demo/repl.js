const readline = require("node:readline");
const { runMondayTurn } = require("../runtime/run-turn");

const PRESET_CONTEXTS = {
  general: {},
  "summer-camp": {
    activeMission: "Summer Camp",
    threadKey: "summer-camp",
  },
  "wounded-significance": {
    activeMission: "Book",
    threadKey: "wounded-significance",
  },
};

let currentContextName = "general";
let currentContext = { ...PRESET_CONTEXTS[currentContextName] };

function printHelp() {
  console.log(`
Commands:
  /help                       Show this help
  /context                    Show current context
  /context general            Switch to general context
  /context summer-camp        Switch to Summer Camp context
  /context wounded-significance
                              Switch to Wounded Significance context
  /set key=value              Set a context field, e.g. /set presenceMode=family_time
  /unset key                  Remove a context field
  /show                       Show current context object
  /exit                       Quit
`);
}

function printCurrentContext() {
  console.log(`Current context: ${currentContextName}`);
  console.log(JSON.stringify(currentContext, null, 2));
}

function handleCommand(line) {
  if (line === "/help") {
    printHelp();
    return true;
  }

  if (line === "/context") {
    printCurrentContext();
    return true;
  }

  if (line.startsWith("/context ")) {
    const name = line.slice("/context ".length).trim();
    if (!PRESET_CONTEXTS[name]) {
      console.log(`Unknown context '${name}'. Available: ${Object.keys(PRESET_CONTEXTS).join(", ")}`);
      return true;
    }
    currentContextName = name;
    currentContext = { ...PRESET_CONTEXTS[name] };
    printCurrentContext();
    return true;
  }

  if (line.startsWith("/set ")) {
    const pair = line.slice("/set ".length).trim();
    const eq = pair.indexOf("=");
    if (eq === -1) {
      console.log("Use /set key=value");
      return true;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    currentContext[key] = value;
    printCurrentContext();
    return true;
  }

  if (line.startsWith("/unset ")) {
    const key = line.slice("/unset ".length).trim();
    delete currentContext[key];
    printCurrentContext();
    return true;
  }

  if (line === "/show") {
    printCurrentContext();
    return true;
  }

  if (line === "/exit") {
    process.exit(0);
  }

  return false;
}

function renderTurn(input) {
  const result = runMondayTurn({
    input,
    context: currentContext,
  });
  currentContext = result.nextContext;

  console.log("\nEngine State:");
  console.log(
    [
      `  significance: ${result.initialState.significance}`,
      `  classification: ${result.initialState.situationClassification}`,
      `  active_role: ${result.initialState.activeRole}`,
      `  secondary_role: ${result.initialState.secondaryRole || "none"}`,
      `  outcome: ${result.initialState.recommendedOutcome}`,
      `  continuity_thread: ${result.initialState.continuity?.activeSignificanceThread || "none"}`,
      `  progression: ${result.initialState.continuity?.meaningProgression || "none"}`,
      `  thread_inheritance_confidence: ${result.initialState.threadInheritanceConfidence ?? "none"}`,
      `  classification_fallback: ${result.initialState.classificationFallback}`,
      `  fallback_reason: ${result.initialState.fallbackReason || "none"}`,
      `  candidate_domain: ${result.initialState.candidateDomain || "none"}`,
      `  candidate_classification: ${result.initialState.candidateClassification || "none"}`,
      `  candidate_confidence: ${result.initialState.candidateConfidence ?? "none"}`,
    ].join("\n")
  );

  if (
    result.initialState.activeRole !== result.finalState.activeRole ||
    result.initialState.recommendedOutcome !== result.finalState.recommendedOutcome
  ) {
    console.log("\nContract Enforcement:");
    console.log(
      [
        `  final_active_role: ${result.finalState.activeRole}`,
        `  final_secondary_role: ${result.finalState.secondaryRole || "none"}`,
        `  final_outcome: ${result.finalState.recommendedOutcome}`,
      ].join("\n")
    );
  }

  if (result.contract.adjustments.length || result.contract.blocked.length) {
    console.log("\nContract Notes:");
    for (const note of [...result.contract.adjustments, ...result.contract.blocked]) {
      console.log(`  - ${note}`);
    }
  }

  console.log(`\nMonday (${result.voice.voiceMode}):`);
  for (const line of result.voice.lines) {
    console.log(`  ${line}`);
  }

  console.log("\nWorkspace:");
  console.log(
    [
      `  mode: ${result.workspace.workspaceMode}`,
      `  support_intent: ${result.workspace.supportIntent}`,
      `  answer_required_first: ${result.workspace.answerRequiredFirst}`,
    ].join("\n")
  );
  for (const section of result.workspace.sections) {
    console.log(`  - ${section.key}: ${section.summary}`);
  }

  console.log("\nWhy this role:");
  for (const line of result.finalState.explanation.slice(0, 6)) {
    console.log(`  - ${line}`);
  }
  console.log("");
}

function main() {
  console.log("Monday REPL");
  console.log("Talk to the engine directly. Type /help for commands.\n");
  printCurrentContext();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nYou> ",
  });

  rl.prompt();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (!handleCommand(trimmed)) {
      renderTurn(trimmed);
    }

    rl.prompt();
  });
}

main();
