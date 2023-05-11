/**
 * This test suite validates that pointcloud only datasets can be loaded in the app.
 */

describe("pointcloud only datasets", () => {
  before(() =>
    cy.executePythonFixture("3d/pointcloud-only-datasets - before.cy.py")
  );

  beforeEach(() => {
    cy.waitForGridToBeVisible("pointcloud-only-datasets");
  });

  it("should have one looker in one flashlight section", () => {
    cy.get("[data-cy=flashlight-section]")
      .should("be.visible")
      .and("have.length", 1);
    cy.get("[data-cy=looker]").should("be.visible").and("have.length", 1);
  });

  it("should open modal with 3D viewer when sample is clicked", () => {
    cy.get("[data-cy=looker]").click();
    cy.waitForLookerToRender();
    cy.get("[data-cy=looker3d]").compareSnapshot("pcd-only-looker-modal-open");
  });
});
