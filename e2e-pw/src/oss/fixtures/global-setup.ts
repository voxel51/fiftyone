import { PythonRunner } from "src/shared/python-runner/python-runner";
import { getPythonCommand } from "../utils";

async function deleteAllCollections() {
  const runner = new PythonRunner(getPythonCommand);

  runner.exec(`
    import fiftyone as fo
    fo.delete_datasets("*")
  `);
}

export default deleteAllCollections;
