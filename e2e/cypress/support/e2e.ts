// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

Cypress.on("uncaught:exception", (err, runnable, promise) => {
  // returning false here prevents Cypress from failing the test

  // occasionally get this error when clearing the view stages
  if (err.message.includes("Unable to evaluate guard")) {
    console.log(`caught known error: ${err.message}`);
    cy.clearViewStages();
    return false;
  }

  // occasionally get this error from react-three-fiber library
  if (
    err.message.includes(
      "Cannot read properties of null (reading 'addEventListener')"
    )
  ) {
    console.log(`caught known error: ${err.message}`);
    return false;
  }

  console.log(`unknown error: ${err.message}`);

  return true;
});

import "./commands";

compareSnapshotCommand({
  capture: "viewport",
  overwrite: true,
  errorThreshold: 0,
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
