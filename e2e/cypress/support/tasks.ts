import { PythonRunner } from "../../lib/python-runner";

// note: these tasks in node context, i.e. outside of cypress
// note: `cy` is not available in task context
// note: https://docs.cypress.io/api/commands/task

export const customTasks = {
  // task that executes arbitrary python process
  executePythonProcessTask: (sourceCode: string) =>
    PythonRunner.exec(sourceCode),
};
