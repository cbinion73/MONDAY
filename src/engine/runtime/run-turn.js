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

async function runMondayTurn({ input, context = {} }) {
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
    nextContext: {
      ...context,
      continuity: enforced.engineState.continuity,
    },
  };
}

module.exports = {
  runMondayTurn,
};
