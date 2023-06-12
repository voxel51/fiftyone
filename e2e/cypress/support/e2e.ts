// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

import "./commands";

Cypress.on("uncaught:exception", (err, runnable, promise) => {
  // returning false here prevents Cypress from failing the test
  // don't invoke other cypress commands here, otherwise you'll get red herrings that make debugging hard
  // https://github.com/cypress-io/cypress/issues/1217#issuecomment-398461289

  // Unhandled promise rejections will cause seemingly random errors that
  // are very hard to debug.
  if (promise) {
    console.log("Unhandled promise rejection.");
    console.log(promise);
    // If false is returned the exception will be ignored and won't
    // cause the test to fail.
    return false;
  }

  if (
    // occasionally get this error when clearing the view stages
    err.message.includes("Unable to evaluate guard") ||
    // sometimes ResizeObserver fails with the message
    // `ResizeObserver loop limit exceeded`
    // Seems to occur for us in Cypress but never in browser in normal use
    err.message.includes("ResizeObserver") ||
    // occasionally get this error from react-three-fiber library
    err.message.includes(
      "Cannot read properties of null (reading 'addEventListener')"
    )
  ) {
    console.log(`caught known error: ${err.message}`);
    return false;
  }

  // fail in all other cases
  return true;
});

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
