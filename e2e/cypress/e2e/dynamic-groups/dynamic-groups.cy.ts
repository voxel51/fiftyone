/**
 * This test suite validates that dynamic-groups functionality works in the fiftyone app.
 */

const verifyCandidateFields = (fields: string[]) => {
  cy.get("[data-cy=dynamic-group-pill-button]").click();
  // todo: investigate, flaky bug, sometimes multiple group-by-selectors are rendered and the test fails
  cy.get("[data-cy=group-by-selector]").first().click();
  cy.get("[data-cy=selector-results-container]")
    .children()
    .should("have.length", fields.length);
  fields.forEach((field) => {
    const fieldWithDotEscaped = field.replace(/\./g, "\\.");
    cy.get(`[data-cy=selector-result-${fieldWithDotEscaped}]`).should(
      "be.visible"
    );
  });
};

describe("dynamic groups", () => {
  context("folding cifar10 (media type = image) by label", () => {
    before(() => {
      cy.executePythonCode(
        `
        import fiftyone as fo
        import fiftyone.zoo as foz

        cifar10_dataset = foz.load_zoo_dataset("cifar10", split="test", max_samples=50, dataset_name="cifar10")
        cifar10_dataset.persistent = True
      `
      );
    });

    beforeEach(() => {
      cy.waitForGridToBeVisible("cifar10");
    });

    it("should show valid candidates for group-by keys", () => {
      verifyCandidateFields(["ground_truth.id", "ground_truth.label"]);
    });

    it("should create dynamic groups based on ground_truth.label", () => {
      cy.get("[data-cy=entry-counts").should("have.text", "50 samples");

      cy.get("[data-cy=dynamic-group-pill-button]").click();
      cy.get("[data-cy=group-by-selector]").click();
      cy.get("[data-cy=selector-result-ground_truth\\.label]").click();

      cy.get("[data-cy=dynamic-group-btn-submit]").click();

      cy.get("[data-cy=entry-counts").should("have.text", "10 groups");

      // click on the first group and navigate until the end, make sure the tags are consistent
      cy.get("[data-cy=looker]").should("have.length", 10);
      cy.get("[data-cy=looker]").first().click();

      cy.get("[data-cy=modal]").within(() => {
        [
          "airplane",
          "automobile",
          "bird",
          "cat",
          "deer",
          "dog",
          "frog",
          "horse",
          "ship",
          "truck",
        ].forEach((label) => {
          cy.get("[data-cy=looker-tags]")
            .should("have.length.gte", 2)
            .each((tag) => {
              cy.wrap(tag).should("have.text", label);
            });
          cy.get("[data-cy=nav-right-button]").click();
        });
      });
    });
  });

  context.only(
    "folding quickstart-groups (media type = group) by scene_id",
    () => {
      context("unordered", () => {
        before(() => {
          cy.executePythonFixture("dynamic-groups/dynamic-groups.cy.py");
        });

        beforeEach(() => {
          cy.waitForGridToBeVisible("quickstart-groups-dynamic");
        });

        it("should show valid candidates for group-by keys", () => {
          verifyCandidateFields([
            "metadata.mime_type",
            "metadata.size_bytes",
            "scene_id",
            "timestamp",
          ]);
        });

        
      });

      context("ordered", () => {});
    }
  );

  after(() => {
    cy.pause();
  });
});
