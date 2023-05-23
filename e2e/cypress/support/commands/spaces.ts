Cypress.Commands.add("openPanel", (name: string) => {
  cy.get('[title="New panel"').click();
  cy.get('[data-cy="available-panels"]').contains(name).click();
});

Cypress.Commands.add("closePanel", (name: string) => {
  cy.get('[data-cy="panel-tab"]')
    .contains(name)
    .within(() => {
      cy.get('[data-cy="close-panel-button"]').click();
    });
});
