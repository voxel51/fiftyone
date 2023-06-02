/**
 * This test suite validates that quickstart-groups dataset from the zoo can be loaded in the app.
 */

const FIRST_SAMPLE_ID = "003037";
const SECOND_SAMPLE_ID = "007195";
const THIRD_SAMPLE_ID = "004416";

const SLICES = ["left", "pcd", "right"] as const;

describe("quickstart-groups dataset", () => {
  before(() =>
    cy.executePythonFixture(
      "quickstart-groups/quickstart-groups - before.cy.py"
    )
  );

  beforeEach(() => {
    cy.waitForGridToBeVisible("quickstart-groups-12");
  });

  it("should have four lookers in two flashlight sections", () => {
    cy.get("[data-cy=flashlight-section]")
      .should("be.visible")

      .and("have.length", 2);

    cy.get("[data-cy=looker]").should("be.visible").and("have.length", 4);
  });

  it("should show 'left' as default slice in grid", () => {
    cy.get("[data-cy=selector-slice]").should("have.value", "left");
  });

  context("group modal", () => {
    beforeEach(() => {
      cy.get("[data-cy=looker]").first().click();

      cy.waitForLookerToRender();
    });

    it("shows correct pinned slice in modal", () => {
      cy.get("[data-cy=pinned-slice-bar-description]").should(
        "have.text",
        "left is pinned"
      );
    });

    it("changes slice to 'pcd' when 3D viewer is clicked", () => {
      // force click because looker3d has nav-right arrow overlayed on top of it that Cypress complains about
      cy.get("[data-cy=looker3d]").click({ force: true });
      cy.get("[data-cy=pinned-slice-bar-description]").should(
        "have.text",
        "pcd is pinned"
      );
    });

    it("has two images in carousel", () => {
      cy.get("[data-cy=flashlight-section-horizontal]").should(
        "have.length",
        2
      );
    });

    context("navigation", () => {
      SLICES.forEach((slice) => {
        context(`with slice ${slice}`, () => {
          beforeEach(() => {
            // for images / videos, need to click on carousel and then looker 2d to set pinned slice
            // for pcd, need to click on looker 3d to set pinned slice
            switch (slice) {
              case "left":
                cy.get("[data-cy=flashlight-section-horizontal]")
                  .first()
                  .click();
                cy.get("[data-cy=group-container]")
                  .find("[data-cy=looker]")
                  .last() // this is the "main" looker
                  .click();
                break;
              case "right":
                cy.get("[data-cy=flashlight-section-horizontal]")
                  .last()
                  .click();
                cy.get("[data-cy=group-container]")
                  .find("[data-cy=looker]")
                  .last() // this is the "main" looker
                  .click();
                break;
              case "pcd":
                cy.get("[data-cy=looker3d]").click({ force: true });
                break;
            }
          });

          it("should navigate to next and previous sample and carry over active slice selected from slice selector", () => {
            // first sample
            cy.get("[data-cy=sidebar-entry-filepath]").should(
              "include.text",
              getExpectedFileForQuickstartGroups(FIRST_SAMPLE_ID, slice)
            );
            cy.get("[data-cy=pinned-slice-bar-description]").should(
              "have.text",
              `${slice} is pinned`
            );

            // navigate next to second sample
            cy.get("[data-cy=nav-right-button]").click();
            cy.get("[data-cy=sidebar-entry-filepath]").should(
              "include.text",
              getExpectedFileForQuickstartGroups(SECOND_SAMPLE_ID, slice)
            );
            // make sure pinned slice is carried over
            cy.get("[data-cy=pinned-slice-bar-description]").should(
              "have.text",
              `${slice} is pinned`
            );

            // navigate next to third sample
            cy.get("[data-cy=nav-right-button]").click();
            cy.get("[data-cy=sidebar-entry-filepath]").should(
              "include.text",
              getExpectedFileForQuickstartGroups(THIRD_SAMPLE_ID, slice)
            );
            // make sure pinned slice is carried over
            cy.get("[data-cy=pinned-slice-bar-description]").should(
              "have.text",
              `${slice} is pinned`
            );

            // navigate prev to second sample
            cy.get("[data-cy=nav-left-button]").click();
            cy.get("[data-cy=sidebar-entry-filepath]").should(
              "include.text",
              getExpectedFileForQuickstartGroups(SECOND_SAMPLE_ID, slice)
            );
            // make sure pinned slice is carried over
            cy.get("[data-cy=pinned-slice-bar-description]").should(
              "have.text",
              `${slice} is pinned`
            );

            // navigate prev to first sample
            cy.get("[data-cy=nav-left-button]").click();
            cy.get("[data-cy=sidebar-entry-filepath]").should(
              "include.text",
              getExpectedFileForQuickstartGroups(FIRST_SAMPLE_ID, slice)
            );
            // make sure pinned slice is carried over
            cy.get("[data-cy=pinned-slice-bar-description]").should(
              "have.text",
              `${slice} is pinned`
            );
          });
        });
      });
    });
  });
});

const getExpectedFileForQuickstartGroups = (
  prefix: string,
  slice: "left" | "right" | "pcd"
) => {
  switch (slice) {
    case "left":
      return `${prefix}.png`;
    case "right":
      return `${prefix}-2.png`;
    case "pcd":
      return `${prefix}.pcd`;
  }
};
