const { resolveMondayEngine } = require("..");
const { enforceRuntimeContract } = require("../contract/runtime-contract-enforcer");
const { translateMondayVoice } = require("../voice/voice-translator");
const { materializeWorkspace } = require("../workspace/workspace-materializer");
const { inferTruth } = require("./infer-truth");
const {
  applyClassificationAssist,
} = require("../intelligence/classification-assist");
const {
  applyLearnedRecovery,
} = require("../learning/closed-loop-learning");
const { intelligenceEnabled } = require("../intelligence/monday-intelligence");

async function runMondayTurn({ input, context = {}, councilEnabled = false }) {
  const initialState = resolveMondayEngine(input, context);
  const learnedStateResult = applyLearnedRecovery({
    input,
    context,
    engineState: initialState,
  });
  const learnedState = learnedStateResult.engineState;
  const assistedState = await applyClassificationAssist({
    input,
    context,
    engineState: learnedState,
  });
  const enforced = enforceRuntimeContract({
    engineState: assistedState,
    context,
  });
  const truth = inferTruth(enforced.engineState, input);
  const voice = translateMondayVoice({
    engineState: enforced.engineState,
    truth,
  });
  const workspace = materializeWorkspace({
    engineState: enforced.engineState,
    truth,
  });

  // Council: run domain agents when intelligence is available and council is opted in.
  // Council synthesis is additive — it enriches but does not replace the voice layer.
  let council = null;
  if (councilEnabled && intelligenceEnabled()) {
    try {
      const { conveneCouncil } = require("../council/convene");
      const { getRecentCaptures } = require("../personal/personal-store");
      const store = require("../persistence/state-store");
      const domains = truth?.domain ? [truth.domain] : [];
      council = await conveneCouncil({
        domains,
        userInput: input,
        captures: getRecentCaptures(12),
        threads: store.getActiveThreads(),
        synthesize: true,
      });
    } catch (err) {
      console.error("[run-turn] council error:", err.message);
    }
  }

  return {
    input,
    initialState,
    finalState: {
      ...enforced.engineState,
      voiceMode: voice.voiceMode,
      workspaceMode: workspace.workspaceMode,
    },
    truth,
    contract: {
      adjustments: enforced.adjustments,
      blocked: enforced.blocked,
    },
    learningRecovery: assistedState.learningRecovery || null,
    classificationAssist: assistedState.classificationAssist || null,
    voice,
    workspace,
    council,
    nextContext: {
      ...context,
      continuity: enforced.engineState.continuity,
    },
  };
}

module.exports = {
  runMondayTurn,
};
