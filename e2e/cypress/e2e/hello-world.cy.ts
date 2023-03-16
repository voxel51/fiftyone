import { Duration } from "../support/utils";

/**
 * This test suite validates that fiftyone can be launched and be ready for cypress.
 */

describe("hello world", () => {
  let pId: number;

  before(() => {
    cy.executePython("hello-world.cy.py").then((pId_) => {
      pId = pId_;
    });

    return cy.waitForFiftyOneApp(Duration.Seconds(20));
  });

  it("should load the app", () => {
    expect(true).to.equal(true);
    cy.visit("/");
  });

  after(() => {
    cy.killFiftyoneApp(pId);
  });
});
