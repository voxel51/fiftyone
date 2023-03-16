/// <reference types="cypress" />

type ProcessId = number;

// declare custom types here
declare global {
  namespace Cypress {
    interface Chainable<Subject> {
      executePython(pythonFixture: string): Chainable<ProcessId>;
      killFiftyoneApp(pId: number): Chainable<void>;
      consoleLog(message: string): Chainable<void>;
      waitForFiftyOneApp(timeout?: number): Chainable<void>;
    }
  }
}

export {};
