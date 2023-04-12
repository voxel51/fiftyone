describe("session routing", () => {
  let pId: number;

  before(() => {
    cy.executePythonCode(
      `
      import fiftyone as fo
      import fiftyone.zoo as foz

      image = foz.load_zoo_dataset("quickstart")
      groups = foz.load_zoo_dataset("quickstart-groups")

      image.save_view("limit", image.limit(1))

      session = fo.Session()
      session.wait()
      `
    ).then((pId_) => {
      pId = pId_;
    });

    return cy.waitForFiftyOneApp();
  });

  it("should have no dataset selected", () => {
    cy.get("[data-cy=no-dataset]").should("be.visible");
  });

  it("should redirect to / on 404", () => {
    cy.visit("/datasets/not-found");
    cy.location("pathname").should("equal", "/");
    cy.get("[data-cy=no-dataset]").should("be.visible");
  });

  it("should load the quickstart dataset", () => {
    cy.waitForGridToBeVisible();
    cy.location("pathname").should("equal", "/datasets/quickstart");
    cy.visit("/404");
    cy.location("pathname").should("equal", "/datasets/quickstart");
  });

  it("should navigate back", () => {
    cy.waitForGridToBeVisible();
    cy.go("back");
    cy.location("pathname").should("equal", "/");
    cy.get("[data-cy=no-dataset]").should("be.visible");
  });

  it("set saved view", () => {
    cy.waitForGridToBeVisible();
    cy.contains("Unsaved view").click();
    cy.contains("limit").click();
    cy.location("search").should("equal", "?view=limit");
  });

  it("should show the setup page", () => {
    cy.killFiftyoneApp(pId);
    cy.get("[data-cy=setup-page]").should("be.visible");
  });
});
