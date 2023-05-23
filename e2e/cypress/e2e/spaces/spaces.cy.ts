/**
 * This test suite validates that spaces are functioning as expected in the app.
 */

const datasetName = "quickstart";
const actualDatasetName = "quickstart-3";
const splitTolerance = 5;

describe("spaces", () => {
  before(() => {
    cy.loadZooDataset(datasetName, 3);
  });

  after(() => {
    cy.deleteDataset(actualDatasetName);
  });

  beforeEach(() => {
    cy.waitForGridToBeVisible(actualDatasetName);
  });

  it("should only have opened pinned samples panel automatically", () => {
    cy.get('[data-cy="panel-tab"]').should("have.length", 1);
    cy.get('[data-cy="panel-tab"]').contains("Samples");
    cy.get('[data-cy="panel-tab"]')
      .contains("Samples")
      .within(() => {
        cy.get('[data-cy="close-panel-button"]').should("not.exist");
      });
  });

  it("should have one add panel button", () => {
    cy.get('[data-cy="add-panel-button"]').should("have.length", 1);
  });

  it("should have Embeddings in add panel popup", () => {
    cy.get('[title="New panel"').click();
    cy.get('[data-cy="available-panels"]').contains("Embeddings");
  });

  it("should open closable Embeddings panel", () => {
    cy.openPanel("Embeddings");
    cy.get('[data-cy="panel-tab"]')
      .contains("Embeddings")
      .within(() => {
        cy.get('[data-cy="close-panel-button"]').should("exist");
      });
    // todo: should reset session before each test
    cy.closePanel("Embeddings");
  });

  it("should not have Embeddings in add panel popup once opened", () => {
    cy.openPanel("Embeddings");
    cy.get('[title="New panel"').click();
    cy.get('[data-cy="available-panels"]')
      .contains("Embeddings")
      .should("not.exist");
    // todo: should reset session before each test
    cy.closePanel("Embeddings");
  });

  it("should have Histograms in add panel popup", () => {
    cy.get('[title="New panel"').click();
    cy.get('[data-cy="available-panels"]').contains("Histograms");
  });

  it("should not show split panel buttons when only one panel is open", () => {
    cy.get('[data-cy="split-panel-vertically-button"]').should("not.exist");
    cy.get('[data-cy="split-panel-horizontally-button"]').should("not.exist");
  });

  it("should show split panel buttons when more than one panel is open", () => {
    cy.openPanel("Embeddings");
    cy.get('[data-cy="split-panel-vertically-button"]').should("exist");
    cy.get('[data-cy="split-panel-horizontally-button"]').should("exist");
    // todo: should reset session before each test
    cy.closePanel("Embeddings");
  });

  it("should be able to split panel horizontally", () => {
    cy.openPanel("Embeddings");
    cy.get('[data-cy="split-panel-horizontally-button"]')
      .should("exist")
      .click();
    cy.get('[data-testid="split-view-view"]', { timeout: 10000 }).should(
      "be.visible"
    );
    cy.get('[data-testid="split-view-view"]')
      .contains("Samples")
      .closest('[data-testid="split-view-view"]')
      .then((leftElem) => {
        cy.get('[data-testid="split-view-view"]')
          .contains("Embeddings")
          .closest('[data-testid="split-view-view"]')
          .then((rightElem) => {
            const leftElemWidth = leftElem[0].clientWidth;
            const rightElemOffsetLeft = rightElem[0].offsetLeft;
            const delta = Math.abs(leftElemWidth - rightElemOffsetLeft);
            expect(delta).to.be.lessThan(splitTolerance);
          });
      });
    // todo: should reset session before each test
    cy.closePanel("Embeddings");
  });

  it("should be able to split panel vertically", () => {
    cy.openPanel("Embeddings");
    cy.get('[data-cy="split-panel-vertically-button"]').should("exist").click();
    cy.get('[data-testid="split-view-view"]', { timeout: 10000 }).should(
      "be.visible"
    );
    cy.get('[data-testid="split-view-view"]')
      .contains("Samples")
      .closest('[data-testid="split-view-view"]')
      .then((topElem) => {
        cy.get('[data-testid="split-view-view"]')
          .contains("Embeddings")
          .closest('[data-testid="split-view-view"]')
          .then((bottomElem) => {
            const topHeight = topElem[0].clientHeight;
            const bottomOffsetTop = bottomElem[0].offsetTop;
            const delta = Math.abs(topHeight - bottomOffsetTop);
            expect(delta).to.be.lessThan(splitTolerance);
          });
      });
    // todo: should reset session before each test
    cy.closePanel("Embeddings");
  });
});
