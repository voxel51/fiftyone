// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

import "./commands";

compareSnapshotCommand({
  capture: "viewport",
  overwrite: true,
  errorThreshold: 0,
});

// todo: check if app port is available in beforeAll() and fail fast if not

// before each test, reset to the root route and wait for the grid to be visible
beforeEach(() => {
  cy.visit("/");
  cy.get("[data-cy=fo-grid]").should("be.visible");
});
