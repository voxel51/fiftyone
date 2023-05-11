// register custom commands here
// note: commands are executed in context of cypress (browser)
// to run code in node, delegate to `cy.task`

import { Duration } from "./utils";

Cypress.Commands.add("executePythonFixture", (pythonFixture) =>
  cy
    .fixture(pythonFixture)
    .then((sourceCode) => cy.task("executePythonProcessTask", sourceCode))
);

Cypress.Commands.add("executePythonCode", (sourceCode) =>
  cy.task("executePythonProcessTask", sourceCode)
);

Cypress.Commands.add("waitForGridToBeVisible", (datasetName?: string) => {
  if (datasetName) {
    cy.visit(`/datasets/${datasetName}`);
  } else {
    cy.visit("/");
    cy.get(`[data-cy="selector-Select dataset"]`).click();
    cy.get("[data-cy=selector-result]").first().click();
  }

  cy.get("[data-cy=fo-grid]").should("be.visible");
});

Cypress.Commands.add(
  "waitForLookerToRender",
  (timeout = Duration.Seconds(0.4)) => {
    cy.wait(timeout ?? Duration.LOOKER_RENDER_MAX_TIME_MS);
  }
);

Cypress.Commands.add("consoleLog", (message) => {
  cy.task("logTask", message);
});
