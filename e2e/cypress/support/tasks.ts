import { DEFAULT_APP_ADDRESS } from "../../lib/constants";
import { PythonRunner } from "../../lib/python-runner";
import waitOn from "wait-on";

// note: these tasks in node context, i.e. outside of cypress
// note: `cy` is not available in task context
// note: https://docs.cypress.io/api/commands/task

export const customTasks = {
  // task that executes arbitrary python process
  executePythonProcessTask: ({ sourceCode }: { sourceCode: string }) => {
    return PythonRunner.exec(sourceCode);
  },
  // task that kills a process with the given pId
  killProcessTask: (props: { pId: number; signal?: string }) => {
    const signal = props.signal ?? "SIGTERM";
    const pId = props.pId;

    try {
      console.log(`Attempting to kill process ${pId}`);
      process.kill(pId, signal);
      console.log(`${signal} sent to process ${pId}`);
    } catch {
      console.log(`Process ${pId} doesn't exist`);
    }

    // need to return null to indicate success
    return null;
  },
  // cy.log logs on the browser console, not in node
  logTask: (message: string) => {
    console.log(message);

    // need to return null to indicate success
    return null;
  },
  // poll and wait for fiftyone server to start
  waitForFiftyoneAppTask: (timeout: number) => {
    console.log(`Waiting for fiftyone app to start, timeout = ${timeout} ms`);
    return new Promise((resolve, reject) =>
      waitOn({
        resources: [DEFAULT_APP_ADDRESS],
        timeout: timeout,
      })
        // need to return null to indicate success
        .then(() => resolve(null))
        .catch(reject)
    );
  },
};
