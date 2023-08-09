/// <reference types="cypress" />

type ProcessId = number;

// declare custom types here
declare global {
  namespace Cypress {
    interface Chainable<Subject> {
      clearViewStages(): Chainable<void>;
      executePythonFixture(pythonFixture: string): Chainable<ProcessId>;
      executePythonCode(sourceCode: string): Chainable<ProcessId>;
      consoleLog(message: string): Chainable<void>;
      waitForGridToBeVisible(datasetName?: string): Chainable<void>;
      waitForLookerToRender(timeout?: number): Chainable<void>;
      visualSnapshot(maybeName?: string): Chainable<void>;

      state: State;
    }

    interface State {
      // returns the current test object
      (property: "runnable"): {
        fullTitle: () => string;
      };
      (property: "viewportWidth"): number;
      (property: "viewportHeight"): number;
    }
  }
}

export {};
