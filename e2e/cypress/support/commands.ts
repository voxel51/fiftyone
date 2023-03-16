// register custom commands here
// note: commands are executed in context of cypress (browser)
// to run code in node, delegate to cy.task

import { DEFAULT_APP_LOAD_TIMEOUT } from "lib/constants";

Cypress.Commands.add("executePython", (pythonFixture) => {
  return cy
    .fixture(pythonFixture)
    .then((sourceCode) => cy.task("executePythonProcessTask", { sourceCode }));
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
