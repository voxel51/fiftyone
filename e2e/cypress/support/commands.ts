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
  const clear = () => {
    // chaining with root in case modal is open and ctx is within modal
    cy.wait(1000);
    cy.root().find("[data-cy=btn-clear-view-bar]").click();
    // unfortunately, can take long.
    // todo: emit an event and make it more deterministic.
    cy.wait(1000);
  };

  const checkIfStagesAreClear = (attemptCount: number) => {
    // check if view stages is clear, if not, call clear() again
    cy.get("[data-cy=view-stage-container]").then((elements) => {
      const isStagesClear =
        elements.length === 1 && elements.text().includes("add stage");
      if (!isStagesClear && attemptCount < 3) {
        console.log(`view stages not clear, (attempt ${attemptCount})`);
        clear();
        // call recursively until view stages are clear or attempt limit reached
        checkIfStagesAreClear(attemptCount + 1);
      }

      if (!isStagesClear && attemptCount >= 3) {
        throw new Error("view stages not clear after 3 attempts");
      }
    });
  };

  clear();
  // xstate lib randomly errors out sometimes, so we need to check if stages are clear
  // check custom exception handling in e2e.ts for more info
  checkIfStagesAreClear(1);
});

Cypress.Commands.add("consoleLog", (message) => {
  console.log(message);
  cy.task("logTask", message);
});
