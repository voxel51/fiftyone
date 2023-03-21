import { Duration } from "../../support/utils";

/**
 * This test suite validates that pointcloud only datasets can be loaded in the app.
 */

describe("pointcloud only datasets", () => {
  let pId: number;

  before(() => {
    cy.executePythonFixture("3d/pointcloud-only-datasets - before.cy.py").then(
      (pId_) => {
        pId = pId_;
      }
    );

    return cy.waitForFiftyOneApp(Duration.Seconds(20));
  });

  beforeEach(() => {
    cy.visit("/");
  });

  it("should show pointcloud dataset", () => {
    cy.location("pathname").should(
      "equal",
      "/datasets/pointcloud-only-datasets"
    );

    cy.get("[data-cy=fo-grid]").should("be.visible");
  });

  it("should show have one looker in one flashlight section", () => {
    cy.get("[data-cy=flashlight-section]")
      .should("be.visible")
      .and("have.length", 1);

    cy.get("[data-cy=looker]").should("be.visible").and("have.length", 1);
  });

  it("should open modal with 3D viewer when sample is clicked", () => {
    cy.get("[data-cy=looker]").click();

    cy.waitForLookerToRender();

    cy.compareSnapshot("pointcloud only dataset modal open");
    cy.screenshot("test");
  });

  after(() => {
    cy.killFiftyoneApp(pId);
  });
});
