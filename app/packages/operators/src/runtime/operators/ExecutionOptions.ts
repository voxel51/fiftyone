import Orchestrator from "./Orchestrator";

/**
 * Class representing execution options for an operator.
 */
export default class ExecutionOptions {
  constructor(
    public orchestratorRegistrationEnabled: boolean,
    public allowImmediateExecution: boolean,
    public allowDelegatedExecution: boolean,
    public availableOrchestrators: Orchestrator[] = [],
    public defaultChoiceToDelegated: boolean = false
  ) {}

  static fromJSON(json: any) {
    return new ExecutionOptions(
      json.orchestratorRegistrationEnabled,
      json.allowImmediateExecution,
      json.allowDelegatedExecution,
      json.availableOrchestrators.map((o: any) => Orchestrator.fromJSON(o)),
      json.defaultChoiceToDelegated
    );
  }
}
