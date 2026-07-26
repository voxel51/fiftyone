import { createContext, useContext } from "react";

/**
 * Emphasis state of the surrounding scene-annotation entity. Hover and
 * selection share the emphasis color but render differently: hovered
 * entities keep solid strokes while selected (or cross-tile echoed)
 * entities draw dashed outlines, matching the 2D overlay convention.
 * Provided per entity by `SceneAnnotationLayer`; primitive meshes read
 * it to swap their material to the emphasis style.
 */
export type SceneEmphasis = "none" | "hover" | "selected";

export const SceneEmphasisContext = createContext<SceneEmphasis>("none");

export function useSceneEmphasis(): SceneEmphasis {
  return useContext(SceneEmphasisContext);
}
