import { getFetchFunction } from "@fiftyone/utilities";
import type {
  AgentTaskType,
  AnnotationAgent,
  AnnotationAgentLifecycle,
  AnnotationAgentLifecycleListener,
  AnnotationAgentLifecycleStatus,
  AnnotationContext,
  InferenceCapability,
  InferenceResult,
  InferenceResultProxy,
  ModelMetadata,
  SyncInferenceResult,
} from "./types";
import { OperatorResponse } from "@fiftyone/operators/src/types";

/**
 * Annotation agent backed by a server-side operator.
 *
 * Capabilities and supported tasks are advertised via the operator's
 * `resolve_input` schema (reflective API). Inference is dispatched via the
 * operator's `execute` method.
 *
 * If the operator runs as a delegated operation, the agent
 * returns an {@link AsyncInferenceResult}; otherwise it returns a
 * {@link SyncInferenceResult}.
 *
 * The operator's `resolve_input` must expose the following top-level
 * properties so reflection works correctly:
 *
 *   supported_tasks - list[str], default = e.g. ["segment"]
 *   inference_capabilities - list[str], default = e.g. ["positivePoint", "roi"]
 *   model_metadata - object with at least a "name" field
 *
 * All {@link AnnotationContext} fields are forwarded to the operator as
 * `params`, so the operator can access them via `ctx.params`.
 */
export class OperatorAnnotationAgent<T extends InferenceResultProxy>
  implements AnnotationAgent<T>
{
  private readonly subscriptionControllers = new Map<string, AbortController>();
  private lifecycleStatus: AnnotationAgentLifecycleStatus = "idle";
  private readonly lifecycleListeners =
    new Set<AnnotationAgentLifecycleListener>();

  constructor(private readonly operatorUri: string) {}

  /**
   * Dispatches inference to the backing operator via `POST /operators/execute`.
   *
   * If the operator runs synchronously, the result is returned immediately as a
   * `SyncInferenceResult`. If the operator is configured for delegated
   * (async) execution, the API returns `delegated: true` together with an
   * executor ID; this method wraps that ID as an `AsyncInferenceResult` so
   * the caller can subscribe for updates.
   *
   * @throws Error If the server returns a top-level error or a result-level error.
   * @throws Error If the operator returns a delegated result but no executor ID.
   */
  async infer(context: AnnotationContext): Promise<InferenceResult<T>> {
    this.setLifecycleStatus("inferring");

    try {
      const response = await getFetchFunction()<
        OperatorRequest,
        OperatorResponse<T>
      >("POST", "/operators/execute", this.buildExecuteBody(context));

      if (response.error || response.error_message) {
        throw new Error(response.error ?? response.error_message);
      }

      if (response.delegated) {
        const sessionId = response.result?.id;
        if (!sessionId) {
          throw new Error(
            `Operator ${this.operatorUri} returned a delegated result with no operator id`
          );
        }
        // Delegated execution: surface the handoff as idle locally; subscribers
        // will receive sync results out-of-band.
        this.setLifecycleStatus("idle");
        return { type: "async", sessionId };
      }

      this.setLifecycleStatus("idle");
      return {
        type: "sync",
        taskType: context.taskType,
        response: response.result?.result,
      };
    } catch (err) {
      this.setLifecycleStatus("error");
      this.emitLifecycle({
        kind: "error",
        error: {
          kind: "inference_failure",
          message: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Calls `resolve-type` with no task param and reads the `supported_tasks`
   * default value from the operator's input schema.
   */
  async listSupportedTasks(): Promise<AgentTaskType[]> {
    const schema = await this.resolveInputSchema({});
    const supportedTasks = schema?.type?.properties
      ?.supported_tasks as ResolveTypePropertyEntry<AgentTaskType[]>;
    return supportedTasks?.default ?? ([] as AgentTaskType[]);
  }

  /**
   * Calls `resolve-type` with `{ task }` in params and reads the
   * `inference_capabilities` default value from the operator's input schema.
   *
   * @param task The task to query capabilities for.
   */
  async listInferenceCapabilities(
    task: AgentTaskType
  ): Promise<InferenceCapability[]> {
    const schema = await this.resolveInputSchema({ task });
    const inferenceCapabilities = schema?.type?.properties
      ?.inference_capabilities as ResolveTypePropertyEntry<
      InferenceCapability[]
    >;
    return inferenceCapabilities?.default ?? ([] as InferenceCapability[]);
  }

  /**
   * Calls `resolve-type` with `{ task }` in params and reads the
   * `model_metadata` default value from the operator's input schema.
   *
   * @param task The task to query model metadata for.
   */
  async getModelMetadata(task: AgentTaskType): Promise<ModelMetadata | null> {
    const schema = await this.resolveInputSchema({ task });
    const modelMetadata = schema?.type?.properties
      ?.model_metadata as ResolveTypePropertyEntry<ModelMetadata>;
    return modelMetadata?.default ?? null;
  }

  /**
   * Subscribes to updates for an in-progress async inference session.
   */
  async subscribe(
    sessionId: string,
    callback: (result: SyncInferenceResult<T>) => void
  ): Promise<void> {
    // todo
  }

  /**
   * Closes the subscription for the given session.
   *
   * To cancel the operation, see {@link abort}.
   */
  async unsubscribe(sessionId: string): Promise<void> {
    this.subscriptionControllers.get(sessionId)?.abort();
    this.subscriptionControllers.delete(sessionId);
  }

  /**
   * Cancels an in-progress async inference session.
   */
  async abort(sessionId: string): Promise<void> {
    await this.unsubscribe(sessionId);
    // todo backend abort
  }

  onLifecycleEvent(listener: AnnotationAgentLifecycleListener): () => void {
    this.lifecycleListeners.add(listener);
    return () => {
      this.lifecycleListeners.delete(listener);
    };
  }

  getLifecycleStatus(): AnnotationAgentLifecycleStatus {
    return this.lifecycleStatus;
  }

  private setLifecycleStatus(status: AnnotationAgentLifecycleStatus): void {
    if (status === this.lifecycleStatus) return;
    this.lifecycleStatus = status;
    this.emitLifecycle({ kind: "status", status });
  }

  private emitLifecycle(event: AnnotationAgentLifecycle): void {
    for (const listener of this.lifecycleListeners) {
      listener(event);
    }
  }

  /**
   * Constructs the minimal request body for `POST /operators/execute`.
   *
   * All context fields are forwarded as `params`.
   */
  private buildExecuteBody(params: Record<string, unknown>): OperatorRequest {
    return {
      operator_uri: this.operatorUri,
      params,
    };
  }

  /**
   * Calls `POST /operators/resolve-type` with `target: "inputs"` to derive
   * the operator's input schema.
   *
   * @param params Params forwarded to the operator's `resolve_input`.
   */
  private async resolveInputSchema(
    params: Record<string, unknown>
  ): Promise<ResolveTypeResponse> {
    const response: ResolveTypeResponse = await getFetchFunction()(
      "POST",
      "/operators/resolve-type",
      {
        operator_uri: this.operatorUri,
        params,
        target: "inputs",
      }
    );
    if (response?.error) throw new Error(String(response.error));
    return response;
  }

  /**
   * Validates that all capabilities advertised by the operator for each of its
   * supported tasks are actually present as properties in its input schema.
   *
   * @throws Error if any expected inputs are missing
   */
  async validateOperator(): Promise<void> {
    const tasks = await this.listSupportedTasks();
    for (const task of tasks) {
      const [schema, capabilities] = await Promise.all([
        this.resolveInputSchema({ task }),
        this.listInferenceCapabilities(task),
      ]);
      const props: Record<string, unknown> = schema?.type?.properties ?? {};
      for (const capability of capabilities) {
        if (!(capability in props)) {
          throw new Error(
            `Operator ${this.operatorUri} is missing required input property ` +
              `"${capability}" for task "${task}"`
          );
        }
      }
    }
  }
}

/**
 * Request type for `resolve_input` and `execute` operator methods.
 */
type OperatorRequest = {
  operator_uri: string;
  params: Record<string, unknown>;
};

/**
 * A single property entry in a resolve-type schema response.
 */
type ResolveTypePropertyEntry<T> = {
  default?: T;
  type?: ResolveTypeObject;
};

/**
 * Object node in the resolve-type schema tree.
 */
type ResolveTypeObject = {
  name?: string;
  properties?: Record<string, ResolveTypePropertyEntry<unknown>>;
};

/**
 * Raw JSON shape returned by `POST /operators/resolve-type`.
 */
type ResolveTypeResponse = {
  error?: string;
  type?: ResolveTypeObject;
};
