export type OperatorConfigOptions = {
  name: string;
  label?: string;
  description?: string;
  executeAsGenerator?: boolean;
  dynamic?: boolean;
  unlisted?: boolean;
  onStartup?: boolean;
  onDatasetOpen?: boolean;
  canExecute?: boolean;
  disableSchemaValidation?: boolean;
  icon?: string;
  darkIcon?: string;
  lightIcon?: string;
  resolveExecutionOptionsOnChange?: boolean;
  skipInput?: boolean;
  skipOutput?: boolean;
};

export default class OperatorConfig {
  public name: string;
  public label: string;
  public description: string;
  public executeAsGenerator: boolean;
  public dynamic: boolean;
  public unlisted: boolean;
  public onStartup: boolean;
  public onDatasetOpen: boolean;
  public canExecute: boolean;
  public disableSchemaValidation: boolean;
  public icon: string | null;
  public darkIcon: string | null;
  public lightIcon: string | null;
  public resolveExecutionOptionsOnChange: boolean;
  public skipInput: boolean;
  public skipOutput: boolean;

  constructor(options: OperatorConfigOptions) {
    this.name = options.name;
    this.label = options.label || options.name;
    this.description = options.description || "";
    this.executeAsGenerator = options.executeAsGenerator || false;
    this.dynamic = options.dynamic || false;
    this.unlisted = options.unlisted || false;
    this.onStartup = options.onStartup || false;
    this.onDatasetOpen = options.onDatasetOpen || false;
    this.canExecute = options.canExecute !== false;
    this.disableSchemaValidation = options.disableSchemaValidation || false;
    this.icon = options.icon || null;
    this.darkIcon = options.darkIcon || null;
    this.lightIcon = options.lightIcon || null;
    this.resolveExecutionOptionsOnChange =
      options.resolveExecutionOptionsOnChange || false;
    this.skipInput = options.skipInput || false;
    this.skipOutput = options.skipOutput || false;
  }

  static fromJSON(json: Partial<OperatorConfigOptions>): OperatorConfig {
    return new OperatorConfig({
      name: json.name || "",
      label: json.label,
      description: json.description,
      executeAsGenerator: json.executeAsGenerator,
      dynamic: json.dynamic,
      unlisted: json.unlisted,
      onStartup: json.onStartup,
      onDatasetOpen: json.onDatasetOpen,
      canExecute: json.canExecute,
      disableSchemaValidation: json.disableSchemaValidation,
      icon: json.icon,
      darkIcon: json.darkIcon,
      lightIcon: json.lightIcon,
      resolveExecutionOptionsOnChange: json.resolveExecutionOptionsOnChange,
      skipInput: json.skipInput,
      skipOutput: json.skipOutput,
    });
  }
}
