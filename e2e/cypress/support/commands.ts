// register custom commands here
// note: commands are executed in context of cypress (browser)
// to run code in node, delegate to `cy.task`

import { DEFAULT_APP_LOAD_TIMEOUT } from "lib/constants";
import { Duration } from "./utils";

Cypress.Commands.add("executePythonFixture", (pythonFixture) => {
  return cy
    .fixture(pythonFixture)
    .then((sourceCode) => cy.task("executePythonProcessTask", { sourceCode }));
});

Cypress.Commands.add("executePythonCode", (sourceCode) => {
  return cy.task("executePythonProcessTask", { sourceCode });
});

Cypress.Commands.add("waitForLookerToRender", (timeout = 100) => {
  cy.wait(timeout ?? Duration.LOOKER_RENDER_MAX_TIME_MS);
});

Cypress.Commands.add("killFiftyoneApp", (pId) => {
  cy.task("killProcessTask", { pId });
});

Cypress.Commands.add(
  "waitForFiftyOneApp",
  (timeout = DEFAULT_APP_LOAD_TIMEOUT) => {
    return cy.task("waitForFiftyoneAppTask", timeout);
  }
);

Cypress.Commands.add("consoleLog", (message) => {
  cy.task("logTask", message);
});

// custom command to make taking snapshots with full name
// formed from the test title + suffix easier
// cy.visualSnapshot() // default full test title
// cy.visualSnapshot('clicked') // full test title + ' - clicked'
// also sets the width and height to the current viewport
Cypress.Commands.add("visualSnapshot", (maybeName) => {
  let snapshotTitle = cy.state("runnable").fullTitle();
  if (maybeName) {
    snapshotTitle = snapshotTitle + " - " + maybeName;
  }
  cy.percySnapshot(snapshotTitle, {
    widths: [cy.state("viewportWidth")],
    minHeight: cy.state("viewportHeight"),
  });
});
