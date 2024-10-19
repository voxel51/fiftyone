import OperatorConfig from "./OperatorConfig";
import ExecutionContext from "./ExecutionContext";
import OperatorResult from "./OperatorResult";
import { resolveRemoteType } from "./resolveOperator";

export default class Operator {
  public isRemote: boolean = false;

  constructor(
    public pluginName: string,
    public _builtIn: boolean = false,
    public _config: OperatorConfig = null
  ) {}

  get config(): OperatorConfig {
    return this._config;
  }

  get name(): string {
    return this.config.name;
  }

  get label(): string {
    return this.config.label;
  }

  get uri(): string {
    return `${this.pluginName || "@voxel51/operators"}/${this.name}`;
  }

  async resolveInput(ctx: ExecutionContext): Promise<any> {
    if (this.config.skipInput) return null;

    if (this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "inputs");
    }
    return null;
  }

  async resolveOutput(
    ctx: ExecutionContext,
    result: OperatorResult
  ): Promise<any> {
    if (this.config.skipOutput) return null;

    if (this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "outputs", result);
    }
    return null;
  }

  async execute(ctx: ExecutionContext): Promise<void> {
    throw new Error(`Operator ${this.uri} does not implement execute`);
  }

  static fromRemoteJSON(json: object): Operator {
    const operator = Operator.fromJSON(json);
    operator.isRemote = true;
    return operator;
  }

  static fromJSON(json: {
    plugin_name: string;
    _builtin: boolean;
    config: object;
  }): Operator {
    const config = OperatorConfig.fromJSON(json.config);
    return new Operator(json.plugin_name, json._builtin, config);
  }
}
