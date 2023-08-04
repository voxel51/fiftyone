/**
 * This test suite validates that dynamic-groups functionality works in the fiftyone app.
 */

const verifySceneIdTimestamp = (
  sceneId: number,
  timestamp: number,
  ordered: boolean
) => {
  cy.get("[data-cy=dynamic-group-pagination-bar-input]").should(
    "have.value",
    timestamp + 1
  );
  cy.get("[data-cy=sidebar-entry-timestamp]").should("have.text", timestamp);
  cy.get("[data-cy=sidebar-entry-scene_id]").should("have.text", sceneId);
  cy.get(`[data-cy=dynamic-group-pagination-item-${timestamp + 1}]`).should(
    "have.attr",
    "aria-current",
    "true"
  );

  if (ordered) {
    cy.get(`[data-cy=dynamic-group-pagination-item-${timestamp + 1}]`)
      .trigger("mouseover")
      .then(() => {
        cy.document()
          .find(`[data-cy="tooltip-timestamp: ${timestamp}"]`)
          .should("be.visible");
      });
    cy.get(`[data-cy=dynamic-group-pagination-item-${timestamp + 1}]`).trigger(
      "mouseout"
    );
  }
};

const navigateDynamicGroupsModal = (ordered: boolean) => {
  cy.get("[data-cy=modal]").within(() => {
    // need two flashlight sections in the carousel, one for "left" slice and another for "right" slice
    cy.get("[data-cy=flashlight-section-horizontal]").should("have.length", 2);
    cy.get("[data-cy=looker3d]").should("be.visible");

    // one wrapper is for img/video looker, the other is for 3D
    cy.get("[data-cy=group-sample-wrapper]")
      .first()
      .should("be.visible")
      .within(() => {
        cy.get("[data-cy=looker]").should("have.length", 1);
      });

    const sceneIds = new Set(["0", "1", "2", "3", "4", "5", "6", "7"]);

    for (let i = 0; i < sceneIds.size; i++) {
      cy.get("[data-cy=sidebar-entry-id]").should("be.visible");
      cy.get("[data-cy=sidebar-entry-scene_id]").then((sceneId) => {
        const sceneIdText = sceneId.text();
        const sceneIdNumber = Number(sceneIdText);
        expect(sceneIds.has(sceneIdText)).to.be.true;

        cy.get("[data-cy=tag-scene_id]")
          .should("have.length", 2)
          .each((tag) => {
            cy.wrap(tag).should("have.text", sceneIdText);
          });

        verifySceneIdTimestamp(sceneIdNumber, 0, ordered);

        // navigate between groups within the current dynamic group
        cy.get("[data-cy=dynamic-group-pagination-bar]").should("be.visible");
        cy.get("[data-cy=dynamic-group-pagination-bar-input]").should(
          "have.value",
          "1"
        );

        cy.get("[data-cy=dynamic-group-pagination-item-25]").should(
          "be.visible"
        );

        // first button = prev, last button = next
        cy.get("[data-cy=dynamic-group-pagination-item-btn]").last().click();

        verifySceneIdTimestamp(sceneIdNumber, 1, ordered);

        cy.get("[data-cy=dynamic-group-pagination-item-5]").click();

        verifySceneIdTimestamp(sceneIdNumber, 4, ordered);

        // first button = prev, last button = next
        cy.get("[data-cy=dynamic-group-pagination-item-btn]").first().click();

        verifySceneIdTimestamp(sceneIdNumber, 3, ordered);

        // check if random access works
        cy.get("[data-cy=dynamic-group-pagination-bar-input]")
          .focus()
          .clear()
          .type("22");

        verifySceneIdTimestamp(sceneIdNumber, 21, ordered);

        cy.get("[data-cy=dynamic-group-pagination-item-btn]").last().click();

        verifySceneIdTimestamp(sceneIdNumber, 22, ordered);
      });

      // navigate to next scene
      i < 7 && cy.get("[data-cy=nav-right-button]").click();
    }
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
      cy.get("[data-cy=entry-counts]").should("have.text", "50 samples");

      // todo: investigate, "first()" is used to suppress this flakiness;
      // sometimes an extra element is rendered and the test fails
      cy.get("[data-cy=dynamic-group-pill-button]").first().click();
      cy.get("[data-cy=group-by-selector]").click();
      cy.get("[data-cy=selector-result-ground_truth\\.label]").click();

      cy.get("[data-cy=dynamic-group-btn-submit]").click();

      cy.get("[data-cy=entry-counts]").should("have.text", "10 groups");

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
          // this is to make sure sample has loaded
          cy.get("[data-cy=sidebar-entry-id]").should("be.visible");

          cy.get("[data-cy=tag-ground_truth]")
            .should("have.length.gte", 2)
            .each((tag) => {
              cy.wrap(tag).should("have.text", label);
            });

          // truck is the last sample and will not have a right button
          label !== "truck" && cy.get("[data-cy=nav-right-button]").click();
        });
      });
    });
  });

  context("folding quickstart-groups (media type = group) by scene_id", () => {
    before(() => {
      cy.executePythonFixture("dynamic-groups/dynamic-groups.cy.py");
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

    ["left", "right", "pcd"].forEach((slice) => {
      context(`unordered with slice = ${slice}`, () => {
        before(() => {
          cy.waitForGridToBeVisible("quickstart-groups-dynamic");
          cy.clearViewStages();

          cy.get("[data-cy=entry-counts]").should("have.text", "200 groups");
          // todo: investigate, "first()" is used to suppress this flakiness;
          // sometimes an extra element is rendered and the test fails
          cy.get("[data-cy=dynamic-group-pill-button]").click();
          cy.get("[data-cy=order-by-selector]").should("not.exist");
          cy.get("[data-cy=group-by-selector]").click();
          cy.get("[data-cy=selector-result-scene_id]").click();

          cy.get("[data-cy=dynamic-group-btn-submit]").click();

          cy.get("[data-cy=entry-counts]").should("have.text", "8 groups");

          cy.get("[data-cy=checkbox-scene_id]").click();
          cy.get("[data-cy=checkbox-timestamp]").click();

          cy.get("[data-cy=looker]").should("have.length", 8);
        });

        beforeEach(() => {
          // select slice in the grid
          // todo: move it to a custom command
          cy.get("[data-cy=selector-slice]").first().click();
          cy.get(`[data-cy=selector-result-${slice}]`).click();
          cy.get("[data-cy=looker]").first().click();
        });

        it("should create dynamic groups based on scene_id", () => {
          navigateDynamicGroupsModal(false);
        });
      });
    });

    context("ordered", () => {
      it("should create dynamic groups based on scene_id and ordered by timestamp", () => {
        cy.waitForGridToBeVisible();
        cy.clearViewStages();

        // todo: investigate, "first()" is used to suppress this flakiness;
        // sometimes an extra element is rendered and the test fails
        cy.get("[data-cy=dynamic-group-pill-button]").click();
        cy.get("[data-cy=group-by-selector]").click();
        cy.get("[data-cy=selector-result-scene_id]").click();
        cy.get("[data-cy=tab-option-Ordered]").click();
        cy.get("[data-cy=order-by-selector]").click();
        cy.get("[data-cy=selector-result-scene_id]").click();

        cy.get("[data-cy=dynamic-group-btn-submit]").click();

        cy.get("[data-cy=dynamic-group-validation-error").should(
          "have.text",
          "Group by and order by fields must be different."
        );

        cy.get("[data-cy=order-by-selector]").click();
        cy.get("[data-cy=selector-result-timestamp]").click();
        cy.get("[data-cy=dynamic-group-btn-submit]").click();
        cy.get("[data-cy=dynamic-group-validation-error").should("not.exist");

        cy.get("[data-cy=entry-counts]").should("have.text", "8 groups");

        cy.get("[data-cy=checkbox-scene_id]").click();
        cy.get("[data-cy=checkbox-timestamp]").click();

        cy.get("[data-cy=looker]").should("have.length", 8);

        cy.get("[data-cy=looker]").first().click();

        navigateDynamicGroupsModal(true);
      });
    });
  });
});
