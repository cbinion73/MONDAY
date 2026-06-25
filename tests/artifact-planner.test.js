"use strict";

const assert = require("node:assert/strict");
const { buildArtifactPlan } = require("../src/engine/surfacing/artifact-planner");

function main() {
  const denverPlan = buildArtifactPlan({
    input: "I want to travel to Denver Colorado next month. Give me a brief plan.",
    domain: "Travel",
    recommendedOutcome: null,
    skillResults: [],
  });
  assert.equal(denverPlan?.artifactKey, "denver");

  const travelPlan = buildArtifactPlan({
    input: "I am planning a trip next week to celebrate America's 250th birthday. Build the itinerary.",
    domain: "Family",
    recommendedOutcome: null,
    skillResults: [{ skillId: "travel-plan" }],
  });
  assert.equal(travelPlan?.artifactKey, "travel");

  const quantumPlan = buildArtifactPlan({
    input: "Give me a survey of quantum computing.",
    domain: "Research",
    recommendedOutcome: null,
    skillResults: [],
  });
  assert.equal(quantumPlan?.artifactKey, "quantum");

  const healthPlan = buildArtifactPlan({
    input: "Tell me about my health today.",
    domain: "Health",
    recommendedOutcome: "surface_then_advise",
    skillResults: [],
  });
  assert.equal(healthPlan?.artifactKey, "health");

  const websitePlan = buildArtifactPlan({
    input: "Show me the Iran page you found.",
    domain: "News",
    recommendedOutcome: "surface_then_advise",
    skillResults: [{ skillId: "browser-read" }],
  });
  assert.equal(websitePlan?.artifactKey, "website");

  const modelPlan = buildArtifactPlan({
    input: "Build me a model of my current finances and show it to me.",
    domain: "Financial",
    recommendedOutcome: "surface_then_advise",
    skillResults: [{ skillId: "financial-read" }],
  });
  assert.equal(modelPlan?.artifactKey, "dynamic-model");
  assert.equal(modelPlan?.artifactType, "model_display");

  console.log("Monday artifact planner tests passed.");
}

main();
