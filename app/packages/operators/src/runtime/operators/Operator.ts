import OperatorConfig from "./OperatorConfig";
import ExecutionContext from "./ExecutionContext";
import OperatorResult from "./OperatorResult";
import { resolveRemoteType } from "./resolveOperator";
import * as types from "../../types";

export default class Operator {
  constructor(
    public pluginName: string,
    public _builtIn: boolean = false,
    public _config: OperatorConfig = null
  ) {
    this._config = _config;
  }

  get config(): OperatorConfig {
    return this._config;
  }
  get name(): string {
    return this.config.name;
  }
  get label(): string {
    return this.config.label;
  }
  get uri() {
    return `${this.pluginName || "@voxel51/operators"}/${this.name}`;
  }
  get unlisted() {
    return this.config.unlisted;
  }
  async needsUserInput(ctx: ExecutionContext) {
    const inputs = await this.resolveInput(ctx);
    return inputs && inputs.type && inputs.type.properties.size > 0;
  }
  needsResolution() {
    return this.config.dynamic;
  }
  needsOutputResolution() {
    return this.config.dynamic;
  }
  async needsOutput(ctx: ExecutionContext, result: OperatorResult) {
    const outputs = await this.resolveOutput(ctx, result);
    const hasOutputContent = result.hasOutputContent();
    if (!outputs || !outputs.type) return false;
    const outputType = outputs.type as types.Object;
    if (outputType.properties.size > 0 && hasOutputContent) {
      return true;
    }
    if (result.error) {
      return true;
    }
    return false;
  }
  useHooks(): object {
    // This can be overridden to use hooks in the execute function
    return {};
  }
  async resolveInput(ctx: ExecutionContext) {
    if (this.config.skipInput) return null;

    if (this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "inputs");
    }
    return null;
  }
  async resolveOutput(ctx: ExecutionContext, result: OperatorResult) {
    if (this.config.skipOutput) return null;

    if (this.isRemote) {
      return resolveRemoteType(this.uri, ctx, "outputs", result);
    }
    return null;
  }
  async resolvePlacement(): Promise<void | types.Placement> {
    return null;
  }
  async execute(ctx: ExecutionContext) {
    ctx;
    throw new Error(`Operator ${this.uri} does not implement execute`);
  }
  public isRemote = false;
  static fromRemoteJSON(json: object) {
    const operator = this.fromJSON(json);
    operator.isRemote = true;
    return operator;
  }
  static fromJSON(json: {
    plugin_name: string;
    _builtin: boolean;
    config: object;
  }) {
    const config = OperatorConfig.fromJSON(json.config);
    const operator = new Operator(json.plugin_name, json._builtin, config);
    return operator;
  }
}
