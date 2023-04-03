// register custom commands here
// note: commands are executed in context of cypress (browser)
// to run code in node, delegate to `cy.task`

import { DEFAULT_APP_LOAD_TIMEOUT } from "../../lib/constants";
import { Duration } from "./utils";

Cypress.Commands.add("executePythonFixture", (pythonFixture) => {
  return cy
    .fixture(pythonFixture)
    .then((sourceCode) => cy.task("executePythonProcessTask", { sourceCode }));
});

Cypress.Commands.add("executePythonCode", (sourceCode) => {
  return cy.task("executePythonProcessTask", { sourceCode });
});

Cypress.Commands.add(
  "waitForLookerToRender",
  (timeout = Duration.Seconds(0.4)) => {
    cy.wait(timeout ?? Duration.LOOKER_RENDER_MAX_TIME_MS);
  }
);

Cypress.Commands.add("killFiftyoneApp", (pId) => {
  if (
    process.env.NODE_ENV === "development" &&
    Cypress.env("pause_between_tests")
  ) {
    const logMessage = "Pausing Cypress to allow for debugging";
    console.log(logMessage);
    cy.consoleLog(logMessage);
    cy.pause();
  }
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
