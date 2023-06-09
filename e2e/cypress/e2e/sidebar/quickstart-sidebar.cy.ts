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
      cy.get(
        "[data-cy=categorical-filter-ground_truth\\.detections\\.label]"
      ).should("exist");
      cy.get("[data-cy=sidebar-field-container-ground_truth").within(() => {
        cy.get("[data-cy=entry-count-all]").should("have.text", 199);
      });

      // default filter mode of select "cat" label, expect 7 samples out 50 samples
      cy.get('[data-cy="selector-\\+ filter by label"]').should("exist");
      cy.get("[data-cy=selector-div-ground_truth\\.detections\\.label]").within(
        () => {
          // do not use cy.get("input").type("cat{enter}");
          // that cause the test to be very flasky
          cy.get("input").type("cat");
          cy.get("input").should("have.value", "cat");
          // TODO: need this, otherwise the test is very flaky
          cy.wait(500);
          cy.get("input").type("{enter}");
        }
      );
      cy.get("[data-cy=checkbox-cat]").should("be.visible");
      cy.get("[data-cy=entry-counts]")
        .first()
        .should("have.text", "7 of 50 samples");
      cy.get("[data-cy=entry-count-part]")
        .first()
        .should("have.text", "8 of 199");

      // verify four filtering options
      cy.get("[data-cy=filter-mode-div]").click();
      // animation effect
      // TODO: remove wait by other ways to wait for animation to finish
      cy.wait(500);
      cy.get("[data-cy=filter-option-Select-detections-with-label]").should(
        "be.visible"
      );
      cy.get("[data-cy=filter-option-Exclude-detections-with-label]").should(
        "be.visible"
      );
      cy.get("[data-cy=filter-option-Show-samples-with-label]").should(
        "be.visible"
      );
      cy.get("[data-cy=filter-option-Omit-samples-with-label]").should(
        "be.visible"
      );

      // exclude mode
      // cat checkbox count should be 0 of 80, ground_truth label count should be 191 of 199, sample count should be 50
      cy.get("[data-cy=filter-option-Exclude-detections-with-label]").click();
      cy.get("[data-cy=filter-mode-div]")
        .find("div")
        .should("have.text", "Exclude detections with label");
      cy.get("[data-cy=entry-counts]")
        .first()
        .should("have.text", "50 samples");
      cy.get("[data-cy=entry-count-part]")
        .first()
        .should("have.text", "191 of 199");

      // match mode
      // filter by cat, 15 of 199 ground_truth labels, 7 of 50 samples
      cy.get("[data-cy=filter-mode-div]").click();
      cy.get("[data-cy=filter-option-Show-samples-with-label]").click();
      cy.get("[data-cy=filter-mode-div]")
        .find("div")
        .should("have.text", "Show samples with label");
      cy.get("[data-cy=entry-counts]")
        .first()
        .should("have.text", "7 of 50 samples");
      cy.get("[data-cy=entry-count-part]")
        .first()
        .should("have.text", "15 of 199");

      // omit mode
      // filter by cat, 184 of 199 ground_truth labels, 43 of 50 samples
      cy.get("[data-cy=filter-mode-div]").click();
      cy.get("[data-cy=filter-option-Omit-samples-with-label]").click();
      cy.get("[data-cy=filter-mode-div]")
        .find("div")
        .should("have.text", "Omit samples with label");
      cy.get("[data-cy=entry-counts]")
        .first()
        .should("have.text", "43 of 50 samples");
      cy.get("[data-cy=entry-count-part]")
        .first()
        .should("have.text", "184 of 199");

      // reset filter
      cy.get("[data-cy=Button-Reset]").click();
      cy.get("[data-cy=entry-counts]")
        .first()
        .should("have.text", "50 samples");
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
      cy.get("[data-cy=sidebar-column]").scrollTo("bottom");
      cy.get("[data-cy=filter-mode-div]").click();
      cy.get("[data-cy=filter-option-Show-samples-with-uniqueness]").should(
        "be.visible"
      );
      cy.get("[data-cy=filter-option-Omit-samples-with-uniqueness]").should(
        "be.visible"
      );

      // verify omit option results
      cy.get("[data-cy=filter-option-Omit-samples-with-uniqueness]").click();
      cy.get("[data-cy=entry-counts]")
        .first()
        .should("have.text", "48 of 50 samples");
      cy.get("[data-cy=entry-count-part]")
        .first()
        .should("have.text", "48 of 50");
      cy.get("[data-cy=tag-uniqueness]").each(($el) => {
        const value = Number($el.text());
        expect(value).to.be.lt(0.9);
      });
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
