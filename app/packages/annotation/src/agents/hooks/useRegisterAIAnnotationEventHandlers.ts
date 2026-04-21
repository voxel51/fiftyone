import { useRegisterAnnotationToolEventHandlers } from "./useRegisterAnnotationToolEventHandlers";

/**
 * Hook which registers event handlers for AI-assisted annotation functionality.
 *
 * **Note: this hook must only be invoked in a single top-level component;
 * reuse will cause duplicate event handler registration.**
 */
export const useRegisterAIAnnotationEventHandlers = () => {
  useRegisterAnnotationToolEventHandlers();
};
