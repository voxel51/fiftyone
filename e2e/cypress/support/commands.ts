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
  const forceDatasetFromSelector = () => {
    cy.visit("/");
    cy.get(`[data-cy="selector-Select dataset"]`).click();

    if (datasetName) {
      cy.get(`[data-cy=selector-result-${datasetName}]`).click();
    } else {
      cy.get(`[data-cy^="selector-result"]`).first().click();
    }
  };

  if (!datasetName) {
    forceDatasetFromSelector();
  } else {
    cy.visit(`/datasets/${datasetName}`).then(() => {
      const location = window.location.href;

      // behavior of directly visiting the dataset page is sometimes flaky
      if (!location.includes("datasets")) {
        forceDatasetFromSelector();
      }
    });
  }

  cy.get("[data-cy=fo-grid]").should("be.visible");
});

Cypress.Commands.add(
  "waitForLookerToRender",
  (timeout = Duration.Seconds(0.4)) => {
    cy.wait(timeout ?? Duration.LOOKER_RENDER_MAX_TIME_MS);
  }
);

Cypress.Commands.add("clearViewStages", () => {
  // chaining with root in case modal is open and ctx is within modal
  cy.root().find("[data-cy=btn-clear-view-bar]").click();
});

Cypress.Commands.add("consoleLog", (message) => {
  cy.task("logTask", message);
});
