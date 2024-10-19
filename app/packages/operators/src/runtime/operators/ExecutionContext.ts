import { CallbackInterface } from "recoil";
import { AnalyticsInfo } from "@fiftyone/analytics";
import Executor from "./Executor";
import Panel from "./Panel";
import InvocationRequest from "./InvocationRequest";

export type RawContext = {
  datasetName: string;
  extended: boolean;
  view: string;
  filters: object;
  selectedSamples: Set<string>;
  selectedLabels: any[];
  currentSample: string;
  viewName: string;
  delegationTarget: string;
  requestDelegation: boolean;
  state: CallbackInterface;
  analyticsInfo: AnalyticsInfo;
  extendedSelection: {
    selection: string[] | null;
    scope: string;
  };
  groupSlice: string;
  queryPerformance?: boolean;
};

/**
 * Represents the execution context for an operator.
 */
export default class ExecutionContext {
  public state: CallbackInterface;
  public delegationTarget: string | null;
  public requestDelegation: boolean;
  public currentPanel?: Panel;
  public params: object;
  public _currentContext: RawContext;
  public hooks: object;
  public executor: Executor | null;

  constructor(
    params: object = {},
    _currentContext: RawContext,
    hooks: object = {},
    executor: Executor = null
  ) {
    this.params = params;
    this._currentContext = _currentContext;
    this.hooks = hooks;
    this.executor = executor;
    this.state = _currentContext.state;
    this.delegationTarget = _currentContext.delegationTarget || null;
    this.requestDelegation = _currentContext.requestDelegation || false;
  }

  get datasetName(): string {
    return this._currentContext.datasetName;
  }
  get view(): string {
    return this._currentContext.view;
  }
  get extended(): boolean {
    return this._currentContext.extended;
  }
  get filters(): object {
    return this._currentContext.filters;
  }
  get selectedSamples(): Set<string> {
    return this._currentContext.selectedSamples;
  }
  get selectedLabels(): any[] {
    return this._currentContext.selectedLabels;
  }
  get currentSample(): string {
    return this._currentContext.currentSample;
  }
  get viewName(): string {
    return this._currentContext.viewName;
  }
  get extendedSelection(): { selection: string[] | null; scope: string } {
    return this._currentContext.extendedSelection;
  }
  get groupSlice(): string {
    return this._currentContext.groupSlice;
  }
  get queryPerformance(): boolean {
    return Boolean(this._currentContext.queryPerformance);
  }

  getCurrentPanelId(): string | null {
    return this.params.panel_id || this.currentPanel?.id || null;
  }

  trigger(operatorURI: string, params: object = {}) {
    if (!this.executor) {
      throw new Error(
        "Cannot trigger operator from outside of an execution context"
      );
    }
    this.executor.requests.push(new InvocationRequest(operatorURI, params));
  }

  log(message: string) {
    if (!this.executor) {
      throw new Error("Cannot log from outside of an execution context");
    }
    this.executor.log(message);
  }
}
