import { Duration } from "../../support/utils";

/**
 * This test suite validates that pointcloud only datasets can be loaded in the app.
 */

describe("pointcloud only datasets", () => {
  let pId: number;

  before(() => {
    cy.executePython("3d/pointcloud-only-datasets.cy.py").then((pId_) => {
      pId = pId_;
    });

    return cy.waitForFiftyOneApp(Duration.Seconds(20));
  });

  it("should show a pointcloud dataset", () => {
    cy.visit("/");
    cy.location("pathname").should(
      "equal",
      "/datasets/pointcloud-only-datasets"
    );
    cy.get("[data-cy=fo-grid]").should("have.length", 1);
    cy.get("canvas").click();
    cy.get("[data-cy=looker3d").wait(1000).screenshot();
    // suspend for demo
    cy.wait(Duration.Minutes(30));
  });

  after(() => {
    cy.killFiftyoneApp(pId);
  });
});
