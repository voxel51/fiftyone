import { createContext, useContext } from "react";

/**
 * Whether scene objects should respond to picking (clicks/hover). The
 * panel flips this off while the measurement tool is armed so a
 * measurement click can't simultaneously select an annotation or open a
 * camera tile. Provided INSIDE the canvas tree — React context does not
 * cross the react-three-fiber reconciler boundary.
 */
export const ScenePickingContext = createContext(true);

export function useScenePicking(): boolean {
  return useContext(ScenePickingContext);
}
