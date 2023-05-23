/// <reference types="cypress" />

type ProcessId = number;

// declare custom types here
declare global {
  namespace Cypress {
    interface Chainable<Subject> {
      clearViewStages(): Chainable<void>;
      executePythonFixture(
        pythonFixture: string,
        args?: string[]
      ): Chainable<ProcessId>;
      executePythonCode(sourceCode: string): Chainable<ProcessId>;
      consoleLog(message: string): Chainable<void>;
      waitForGridToBeVisible(datasetName?: string): Chainable<void>;
      waitForLookerToRender(timeout?: number): Chainable<void>;
      visualSnapshot(maybeName?: string): Chainable<void>;
      loadZooDataset(
        datasetName: string,
        maxSamples?: number,
        persistent?: boolean
      ): Chainable<void>;
      deleteDataset(datasetName: string): Chainable<void>;
      openPanel(name?: string): Chainable<void>;
      closePanel(name?: string): Chainable<void>;

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
