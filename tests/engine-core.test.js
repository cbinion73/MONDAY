const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");
const summerCamp = require("../src/engine/fixtures/summer-camp");
const wounded = require("../src/engine/fixtures/wounded-significance");

function runFixture(name, fixture) {
  const result = resolveMondayEngine(fixture.input, fixture.context);
  assert.equal(
    result.significance,
    fixture.expected.significance,
    `${name}: significance`
  );
  assert.equal(
    result.situationClassification,
    fixture.expected.situationClassification,
    `${name}: situationClassification`
  );
  assert.equal(result.activeRole, fixture.expected.activeRole, `${name}: activeRole`);
  assert.equal(
    result.secondaryRole,
    fixture.expected.secondaryRole,
    `${name}: secondaryRole`
  );
  assert.equal(
    result.recommendedOutcome,
    fixture.expected.recommendedOutcome,
    `${name}: recommendedOutcome`
  );
  assert.ok(result.explanation.length > 0, `${name}: explanation should exist`);
}

function main() {
  runFixture("summerCamp.readiness", summerCamp.readiness);
  runFixture("summerCamp.statusCheck", summerCamp.statusCheck);
  runFixture("summerCamp.trailerDecision", summerCamp.trailerDecision);
  runFixture("summerCamp.commitment", summerCamp.commitment);
  runFixture("wounded.quietSignificance", wounded.quietSignificance);
  runFixture("wounded.shameRevealed", wounded.shameRevealed);
  runFixture("wounded.humanCompanyBoundary", wounded.humanCompanyBoundary);

  console.log("Monday Engine core tests passed.");
}

main();
