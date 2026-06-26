"use strict";

const assert = require("node:assert/strict");
const { attachArtifactPresentation } = require("../src/engine/surfacing/artifact-factory");

function main() {
  const plan = attachArtifactPresentation(
    {
      shouldSurface: true,
      artifactType: "model_display",
      artifactKey: "dynamic-model",
      sourceDomain: "financial",
      rationale: "The structure is easier to understand when it is shown instead of described.",
    },
    {
      input: "Build me a model of my current finances and show it to me.",
      domain: "Financial",
      skillResults: [
        {
          skillId: "financial-read",
          confidence: 0.84,
          summary: "Spending is rising faster than income this month.",
          observations: ["Net spending increased 12% month over month."],
          patterns: ["Discretionary spending is pulling the trend upward."],
        },
      ],
    }
  );

  assert.equal(plan?.artifactRuntime?.mode, "dynamic");
  assert.equal(plan?.artifactRuntime?.key, "dynamic-model");
  assert.equal(plan?.artifactRuntime?.payload?.kind, "evidence");
  assert.ok(Array.isArray(plan?.artifactRuntime?.payload?.blocks));
  assert.ok(plan.artifactRuntime.payload.blocks.length >= 3);

  const research = attachArtifactPresentation(
    {
      shouldSurface: true,
      artifactType: "model_display",
      artifactKey: "dynamic-model",
      sourceDomain: "research",
      rationale: "Monday gathered sources and wants them readable in one place.",
    },
    {
      input: "Research trailer rental options and show me the sources.",
      domain: "Travel",
      skillResults: [
        {
          skillId: "browser-search",
          confidence: 0.86,
          summary: "Three vendor candidates surfaced.",
          observations: ["3 search results gathered"],
          patterns: ["search results cluster around the same rental vendors"],
          raw: {
            ok: true,
            data: [
              { title: "U-Haul Trailers", url: "https://www.uhaul.com/", snippet: "Rent trailers online." },
              { title: "Home Depot Truck Rental", url: "https://www.homedepot.com/", snippet: "Truck and trailer options." },
            ],
          },
        },
      ],
    }
  );

  assert.equal(research?.artifactRuntime?.payload?.kind, "research");
  assert.ok(
    research.artifactRuntime.payload.blocks.some((block) => block.type === "source_list"),
    "expected research surface to include a source list"
  );

  const website = attachArtifactPresentation(
    {
      shouldSurface: true,
      artifactType: "website",
      artifactKey: "website",
      sourceDomain: "research",
      rationale: "The user asked to see the live vendor page.",
    },
    {
      input: "Show me the vendor website.",
      domain: "Travel",
      skillResults: [
        {
          skillId: "browser-read",
          confidence: 0.82,
          summary: "Trailer rental search starts on the main U-Haul page.",
          observations: ["Vendor page fetched successfully."],
          patterns: ["this is the cleanest starting point"],
          raw: {
            ok: true,
            title: "U-Haul: Moving Truck Rental",
            url: "https://www.uhaul.com/",
            data: "Rent trailers and moving trucks from U-Haul.",
          },
        },
      ],
    }
  );

  assert.equal(website?.artifactRuntime?.key, "website");
  assert.equal(website?.artifactRuntime?.payload?.kind, "website");
  assert.equal(website?.artifactRuntime?.payload?.url, "https://www.uhaul.com/");

  console.log("Monday artifact factory tests passed.");
}

main();
