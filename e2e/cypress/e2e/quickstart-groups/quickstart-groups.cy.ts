import { Duration } from "../../support/utils";

/**
 * This test suite validates that quickstart-groups dataset from the zoo can be loaded in the app.
 */

describe("quickstart-groups dataset", () => {
  let pId: number;

  before(() => {
    cy.executePythonFixture(
      "quickstart-groups/quickstart-groups - before.cy.py"
    ).then((pId_) => {
      pId = pId_;
    });

    return cy.waitForFiftyOneApp();
  });

  it("should show have four lookers in two flashlight sections", () => {
    cy.get("[data-cy=flashlight-section]")
      .should("be.visible")
      .and("have.length", 2);

    cy.get("[data-cy=looker]").should("be.visible").and("have.length", 4);
  });

  it("should show 'left' as default slice", () => {
    cy.pause();
    cy.get("[data-cy=selector-slice]").should("have.text", "left");
  });

  it("should open group modal when sample is clicked", () => {
    cy.get("[data-cy=looker]").click();
    cy.waitForLookerToRender();
    cy.get("[data-cy=looker3d]").compareSnapshot("pcd-only-looker-modal-open");
  });

  after(() => {
    cy.killFiftyoneApp(pId);
  });
});
