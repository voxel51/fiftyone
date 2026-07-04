import { createContext, useContext } from "react";

/**
 * Whether the surrounding scene-annotation entity is emphasized
 * (selected or cross-tile echoed). Provided per entity by
 * `SceneAnnotationLayer`; primitive meshes read it to swap their
 * material to the emphasis style.
 */
export const SceneEmphasisContext = createContext(false);

export function useSceneEmphasis(): boolean {
  return useContext(SceneEmphasisContext);
}
