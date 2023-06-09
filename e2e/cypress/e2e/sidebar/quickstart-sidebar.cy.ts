/**
 * This test suite validates that sidebar filtering functionality works in the fiftyone app with quickstart dataset.
 */

describe("Sidebar filter", () => {
  context("quickstart dataset filter", () => {
    before(() => {
      cy.executePythonCode(
        `
            import fiftyone as fo
            import fiftyone.zoo as foz
            quickstart_dataset = foz.load_zoo_dataset("quickstart", max_samples=50, dataset_name="quickstart-test")
            quickstart_dataset.persistent = True
          `
      );
    });

    beforeEach(() => {
      cy.waitForGridToBeVisible("quickstart-test");
    });

    it("should show all default sidebar groups by names", () => {
      const defaultGroups = ["TAGS", "METADATA", "LABELS", "PRIMITIVES"];
      defaultGroups.forEach((g) => {
        cy.get(`[data-cy=sidebar-group-${g}]`).should("exist");
      });
    });

    it("should be able to filter by ground_truth label", () => {
      // ground_truth selector should be visible and expandable
      cy.get("[data-cy=sidebar-field-ground_truth]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-ground_truth]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-ground_truth]").click();

      // entry count should be 199 before filtering
      cy.contains("199", { timeout: 5000 }).should("be.visible");
      cy.get("[data-cy=sidebar-field-container-ground_truth").within(() => {
        cy.get("[data-cy=entry-count-all]").should("have.text", 199);

        // select "cat" label, expect 7 samples out 50 samples
        cy.get('[data-cy="selector-\\+ filter by label"]')
          .first()
          .should("exist");

        // workaround
        cy.get("[data-cy=selector-div-ground_truth]").within(() => {
          cy.get("input").type("cat");
        });
      });
    });

    it("should be able to filter by primitive field", () => {
      cy.get("[data-cy=sidebar-field-uniqueness]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-uniqueness]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-uniqueness]").click();
      // turn on the uniqueness tags on looker
      cy.get("[data-cy=checkbox-uniqueness]").click();
      // wait for the filter to expand
      cy.contains("0.54", { timeout: 5000 }).should("be.visible");

      // move slider's min to 0.90
      cy.get(".MuiSlider-root")
        .first()
        .within(() => {
          cy.get("input").first().should("have.value", "0.540524359851793");
          cy.get("input").last().should("have.value", "1");
          cy.get("input")
            .first()
            .invoke("val", 0.9)
            .trigger("input", { force: true });
        });
      // grid aggregation summary
      cy.get("[data-cy=entry-counts]").should("have.text", "2 of 50 samples");
      // field aggregation summary
      cy.get("[data-cy=entry-count-part]")
        .last()
        .should("have.text", "2 of 50");

      // check the tags on looker of filtered samples
      cy.get("[data-cy=tag-uniqueness]").each(($el) => {
        // get the text of the element and convert it into a number
        const value = Number($el.text());
        // assert that the value is greater than 1
        expect(value).to.be.gt(0.9);
      });

      // primitive fields should have match/omit two options

      // verify omit option results
    });

    it("should be able to filter by ground_truth field in modal view", () => {
      // open the modal view
      // cy.get("[data-cy=modal-view-button]").click();
      // wait for the modal to open
      // cy.get("[data-cy=modal]").should("be.visible");
      // open the ground_truth field
      // cy.get("[data-cy=sidebar-field-ground_truth]").click();
      // select the "cat" label
      // cy.get("[data-cy=selector-\\+ filter by label]").click();
      // wait for the grid to refresh
      // cy.get("[data-cy=entry-counts]").should("have.text", "7 of 50 samples");
      // close the modal
      // cy.get("[data-cy=modal-close-button]").click();
    });

    it("should be able to use tagger with no samples selected", () => {
      // verify sample tags number and label tags number on the tagger popout
      // tag all labels as "<0.90"
      // after grids refresh, verify the new tag and its count on label tags
      // tag all samples in the dataset as "all"
      // after grids refresh, verify the new sample tags are created
    });
  });
});
