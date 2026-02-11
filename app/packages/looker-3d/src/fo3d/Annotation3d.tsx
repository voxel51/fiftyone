import { use3dAnnotationEventHandlers } from "../hooks/use3dAnnotationEventHandlers";

/**
 * Component that registers 3D annotation event handlers.
 */
export const Annotation3d = () => {
  use3dAnnotationEventHandlers();

  return null;
};
