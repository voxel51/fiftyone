// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

import "./commands";

compareSnapshotCommand({
  capture: "viewport",
  overwrite: true,
  errorThreshold: 0,
});

// delete all datasets before running tests
// todo: investigate, this is flaky, sometimes singleton state doesn't reflect dataset deletion
before(() => {
  cy.executePythonCode(
    `
    import fiftyone as fo
    fo.delete_datasets("*")
    `
  );
});
