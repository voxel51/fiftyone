import Operator from "./Operator";
import { remoteRegistry } from "./OperatorRegistry";
import OperatorConfig from "./OperatorConfig";
import { stringifyError } from "../../utils";
import { getFetchFunction } from "@fiftyone/utilities";

export interface LoadOperatorsResponse {
  operators: any[];
  errors: string[];
}

export let initializationErrors: { reason: string; details: string }[] = [];

/**
 * Loads operators from the server for a given dataset.
 *
 * @param datasetName - The name of the dataset to load operators for.
 * @returns A promise that resolves when the operators are loaded.
 */
export default async function loadOperatorsFromServer(
  datasetName: string
): Promise<void> {
  initializationErrors = [];

  try {
    const fetchFunction = getFetchFunction();
    const { operators, errors }: LoadOperatorsResponse = await fetchFunction(
      "POST",
      "/operators",
      { dataset_name: datasetName }
    );

    const operatorInstances = operators.map((operatorData: any) =>
      Operator.fromRemoteJSON({
        ...operatorData,
        config: OperatorConfig.fromJSON(operatorData.config),
      })
    );

    operatorInstances.forEach((operator: Operator) => {
      remoteRegistry.register(operator);
    });

    if (errors?.length > 0) {
      errors.forEach((error) => {
        console.error("Error loading operator:", error);
        initializationErrors.push({
          reason: "Error loading operator",
          details: stringifyError(error),
        });
      });
    }
  } catch (error) {
    const errorMsg = stringifyError(error);
    console.error("Error loading operators from server:", errorMsg);
    initializationErrors.push({
      reason: "Error loading operators from server",
      details: errorMsg,
    });
    throw new Error(errorMsg);
  }
}
