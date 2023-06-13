/**
 * This test suite validates that sidebar filtering and tagger menu functionality works in the fiftyone app with quickstart dataset.
 */

const selectSamplesInGrid = (indices: number[]) => {
  indices.forEach((i) => {
    cy.get("[data-cy=looker]")
      .eq(i)
      .within(() => {
        cy.get("input").click({ force: true });
      });
  });
};

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
          // that causes the test to be very flasky
          cy.get("input").type("cat");
          cy.get("input").should("have.value", "cat");
          cy.wait(300);
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

    it("In grid view, tagger menu count is consistent with aggregation results from sidebar", () => {
      // 1. Default Mode: no filter, no selection
      // open the tagger menu
      cy.get("[data-cy=tagger-pill-button]").should("exist").click();
      cy.get("[data-cy=tagger-switch-sample]").should("be.visible");
      cy.get("[data-cy=tagger-switch-label]").should("be.visible");
      // verify the aggregation results in the sample tagger
      cy.get("[data-cy=sample-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 50 samples"
      );
      // verify the aggregation results in the label tagger
      cy.get("[data-cy=tagger-switch-label]").click();
      cy.get("[data-cy=label-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 1,222 labels"
      );

      // 2. Filter Mode, only select predictions labels:
      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=checkbox-ground_truth]").should("be.visible").click();

      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=sample-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 50 samples"
      );
      cy.get("[data-cy=tagger-switch-label]").click();
      cy.get("[data-cy=label-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 1,023 labels"
      );
      cy.get("[data-cy=tagger-pill-button]").click();

      // 3. Filter Mode, filter by predictions label "elephant" and "broccoli"
      cy.get("[data-cy=sidebar-field-predictions]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-predictions]")
        .should("be.visible")
        .click();
      cy.get("[data-cy=sidebar-column]").scrollTo("bottom");
      cy.contains("1,023", { timeout: 5000 }).should("be.visible");
      cy.get(
        "[data-cy=categorical-filter-predictions\\.detections\\.label]"
      ).should("exist");
      cy.get('[data-cy="selector-\\+ filter by label"]').should("be.visible");
      cy.get("[data-cy=selector-div-predictions\\.detections\\.label]").within(
        () => {
          cy.get("input").type("broccoli").wait(300).type("{enter}");
          cy.get("input").type("elephant").wait(300).type("{enter}");
        }
      );

      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=sample-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 9 samples"
      );
      cy.get("[data-cy=tagger-switch-label]").should("be.visible").click();
      cy.get("[data-cy=label-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 160 labels"
      );
      cy.get("[data-cy=tagger-pill-button]").click();

      // 4. Selection mode, select samples in the grid;
      selectSamplesInGrid([0, 2, 4]);
      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=sample-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 3 selected samples"
      );
      cy.get("[data-cy=tagger-switch-label]").click();
      cy.get("[data-cy=label-tag-input]").should(
        "have.attr",
        "placeholder",
        "+ tag 64 selected labels"
      );
    });

    it("When filter exists, sample tag works correctly", () => {
      cy.get("[data-cy=selected-pill-button]").should("be.visible").click();
      cy.get("[data-cy=item-action-Clear-selected-samples]")
        .should("be.visible")
        .click();
      cy.get("[data-cy=checkbox-tags]").should("be.visible").click();
      cy.get("[data-cy=sidebar-field-arrow-tags]").should("be.visible").click();

      // 1. Filter Mode: tag samples in the dataset
      cy.get("[data-cy=sidebar-field-arrow-predictions]")
        .should("be.visible")
        .click();
      cy.get("[data-cy=sidebar-column]").scrollTo("bottom");
      cy.contains("1,023", { timeout: 5000 }).should("be.visible");
      cy.get(
        "[data-cy=categorical-filter-predictions\\.detections\\.label]"
      ).should("exist");
      cy.get('[data-cy="selector-\\+ filter by label"]').should("be.visible");
      cy.get("[data-cy=selector-div-predictions\\.detections\\.label]").within(
        () => {
          cy.get("input").type("carrot").wait(300).type("{enter}");
        }
      );
      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=sample-tag-input]")
        .type("carrot")
        .wait(200)
        .type("{enter}");
      cy.get("[data-cy=Button-Apply").should("be.visible").click();
      // verify the tag rendered in looker
      cy.get("[data-cy=tag-tags-carrot]").should("have.length", 7);
      // verify the sample tag count in the menu
      cy.get("[data-cy=checkbox-carrot]")
        .should("be.visible")
        .first()
        .within(() => {
          cy.get("span").contains(7).should("exist");
          cy.get("span").contains("carrot").should("exist");
        });
      cy.get("[data-cy=sidebar-column]").scrollTo("bottom");
      cy.get("[data-cy=Button-Reset]").should("be.visible").click();

      // 2. Select Mode: select some samples in the grid
      selectSamplesInGrid([0, 1, 2]);
      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=sample-tag-input]")
        .type("top3")
        .wait(30)
        .type("{enter}");
      cy.get("[data-cy=Button-Apply").should("be.visible").click();
      // verify the tag rendered in looker
      cy.get("[data-cy=tag-tags-top3]").should("have.length", 3);
      // verify the sample tag count in the menu
      cy.get("[data-cy=checkbox-top3]")
        .should("be.visible")
        .first()
        .within(() => {
          cy.get("span").contains(3).should("be.visible");
          cy.get("span").contains("top3").should("be.visible");
        });
      cy.get("[data-cy=refresh-fo]").should("exist").click();
    });

    it("Should be able to select samples and tag labels in the grid", () => {
      cy.get("[data-cy=checkbox-_label_tags]").should("be.visible").click();
      cy.get("[data-cy=sidebar-field-arrow-_label_tags]")
        .should("be.visible")
        .click();

      // selection samples mode, tag labels in the grid
      selectSamplesInGrid([0, 1]);
      cy.get("[data-cy=tagger-pill-button]").click();
      cy.get("[data-cy=tagger-switch-label]").should("be.visible").click();
      cy.get("[data-cy=label-tag-input]").type("test").wait(30).type("{enter}");
      cy.get("[data-cy=Button-Apply").should("be.visible").click();
      // verify the tag rendered in looker
      cy.get("[data-cy=tag-_label_tags-test--17]").should("be.visible");
      cy.get("[data-cy=tag-_label_tags-test--22]").should("be.visible");
      // verify the label tag count in the sidebar
      cy.get("[data-cy=checkbox-test]")
        .should("be.visible")
        .within(() => {
          cy.get("span").contains(39).should("be.visible");
          cy.get("span").contains("test").should("be.visible");
        });
    });

    it("should be able to filter labels by ground_truth field in modal view", () => {
      // open the modal view
      cy.get("[data-cy=looker]")
        .first()
        .find("div")
        .eq(0)
        .click({ force: true });
      cy.get("[data-cy=modal]").should("be.visible");

      // open the ground_truth field
      cy.get("[data-cy=sidebar-field-ground_truth]").eq(1).click();
      cy.get("[data-cy=sidebar-field-ground_truth]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-ground_truth]").should("be.visible");
      cy.get("[data-cy=sidebar-field-arrow-ground_truth]").eq(1).click();

      // check aggregation:
      cy.get(
        "[data-cy=categorical-filter-ground_truth\\.detections\\.label]"
      ).should("exist");
      cy.get("[data-cy=sidebar-field-container-ground_truth")
        .eq(1)
        .within(() => {
          cy.get("[data-cy=entry-count-all]").should("have.text", 3);
        });

      // check filter options and exclude labels:
      cy.get("[data-cy=checkbox-bird").should("be.visible").click();
      cy.get("[data-cy=filter-mode-div]")
        .should("have.text", "Select detections with label")
        .click();
      cy.get("[data-cy=filter-option-Select-detections-with-label]").should(
        "be.visible"
      );
      cy.get("[data-cy=filter-option-Exclude-detections-with-label]")
        .should("be.visible")
        .click();
      cy.get("[data-cy=sidebar-field-container-ground_truth")
        .eq(1)
        .within(() => {
          cy.get("[data-cy=entry-count-part]").should("have.text", "0 of 3");
        });
    });
  });
});
