import { useEffect } from "react";
import { useAgentSelector } from "./useAgentSelector";
import { useAnnotationEventBus } from "../../hooks";
import {
  useSetInferenceProgress,
  useSetInferenceStatus,
} from "./useInferenceStatus";

/**
 * Canonical bridge between the active {@link AnnotationAgent}'s lifecycle
 * emissions and the rest of the app:
 *
 * - Dispatches `annotation:agentLifecycleStatusChange` / `agentDownloadProgress`
 *   / `agentError` on the annotation event bus for cross-surface consumers.
 * - Writes the inference status / progress atoms read by `useInferenceStatus`.
 *
 * The agent is the source of truth — no other site should write to these
 * atoms or dispatch these events.
 *
 * **Note: this hook must only be invoked in a single top-level component;
 * reuse will cause duplicate dispatches and double atom writes.**
 */
export const useRegisterAgentLifecycleEvents = (): void => {
  const { activeAgent } = useAgentSelector();
  const eventBus = useAnnotationEventBus();
  const setInferenceStatus = useSetInferenceStatus();
  const setInferenceProgress = useSetInferenceProgress();

  useEffect(() => {
    const agent = activeAgent?.agent;
    if (!agent) {
      setInferenceStatus("idle");
      setInferenceProgress(null);
      return;
    }

    const currentStatus = agent.getLifecycleStatus();
    setInferenceStatus(currentStatus);
    eventBus.dispatch("annotation:agentLifecycleStatusChange", {
      status: currentStatus,
    });

    return agent.onLifecycleEvent((event) => {
      if (event.kind === "status") {
        setInferenceStatus(event.status);
        // Progress is only meaningful while actively downloading; clear it
        // on every other transition so banners don't show stale percentages.
        if (event.status !== "downloading-weights") {
          setInferenceProgress(null);
        }
        eventBus.dispatch("annotation:agentLifecycleStatusChange", {
          status: event.status,
        });
      } else if (event.kind === "progress") {
        const { file, loaded, total } = event;
        setInferenceProgress({ file, loaded, total });
        eventBus.dispatch("annotation:agentDownloadProgress", {
          file,
          loaded,
          total,
        });
      } else {
        eventBus.dispatch("annotation:agentError", { error: event.error });
      }
    });
  }, [activeAgent, eventBus, setInferenceStatus, setInferenceProgress]);
};
