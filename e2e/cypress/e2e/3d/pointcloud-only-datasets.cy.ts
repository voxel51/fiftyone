import { Duration } from "../../support/utils";

/**
 * This test suite validates that pointcloud only datasets can be loaded in the app.
 */

describe("pointcloud only datasets", () => {
  let pId: number;

  before(() => {
    cy.executePython("3d/pointcloud-only-datasets.py").then((pId_) => {
      pId = pId_;
    });

    return cy.waitForFiftyOneApp(Duration.Seconds(20));
  });

  it("should load the app", () => {
    cy.visit("http://127.0.0.1:5151");
  });

  after(() => {
    cy.killFiftyoneApp(pId);
  });
});
