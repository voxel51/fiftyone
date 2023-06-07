// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

import "./commands";

compareSnapshotCommand({
  capture: "viewport",
  overwrite: true,
  errorThreshold: 0,
});

Cypress.on("uncaught:exception", (err, runnable) => {
  // returning false here prevents Cypress from failing the test
  // if there're certain exceptions we want to ignore, we can add them here
  return true;
});

// delete all datasets before each spec runs
// todo: investigate, this is flaky, sometimes singleton state doesn't reflect dataset deletion
before(() => {
  cy.executePythonCode(
    `
    import fiftyone as fo
    fo.delete_datasets("*")
    `
  );
});
