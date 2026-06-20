const { renderOrientation } = require("./modes/orientation");
const { renderGentleWitness } = require("./modes/gentle-witness");
const { renderCuriousCompanion } = require("./modes/curious-companion");
const { renderProtectiveSteward } = require("./modes/protective-steward");
const { renderDirectAdvisor } = require("./modes/direct-advisor");
const { renderExecutionOperator } = require("./modes/execution-operator");
const { renderHumbleEscalation } = require("./modes/humble-escalation");

function resolveVoiceMode(engineState) {
  const { activeRole, recommendedOutcome } = engineState;

  if (recommendedOutcome === "escalate_to_human_company") {
    return "humble-escalation";
  }
  if (activeRole === "operator") {
    return "execution-operator";
  }
  if (activeRole === "advisor") {
    return "direct-advisor";
  }
  if (activeRole === "steward" && recommendedOutcome === "surface_then_advise") {
    return "orientation";
  }
  if (activeRole === "steward") {
    return "protective-steward";
  }
  if (activeRole === "companion") {
    return "curious-companion";
  }
  if (activeRole === "keeper" || activeRole === "witness") {
    return "gentle-witness";
  }

  return "gentle-witness";
}

function renderByVoiceMode(voiceMode, truth) {
  switch (voiceMode) {
    case "orientation":
      return renderOrientation({ truth });
    case "gentle-witness":
      return renderGentleWitness({ truth });
    case "curious-companion":
      return renderCuriousCompanion({ truth });
    case "protective-steward":
      return renderProtectiveSteward({ truth });
    case "direct-advisor":
      return renderDirectAdvisor({ truth });
    case "execution-operator":
      return renderExecutionOperator({ truth });
    case "humble-escalation":
      return renderHumbleEscalation({ truth });
    default:
      return renderGentleWitness({ truth });
  }
}

function translateMondayVoice({ engineState, truth }) {
  const voiceMode = resolveVoiceMode(engineState);
  const lines = renderByVoiceMode(voiceMode, truth);

  return {
    voiceMode,
    lines,
    text: lines.join(" "),
  };
}

module.exports = {
  resolveVoiceMode,
  translateMondayVoice,
};
