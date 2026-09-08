import { createContext, useContext, type ReactNode } from "react";

import type { GraphicsRuntime } from "./graphics-backend";

const GraphicsRuntimeContext = createContext<GraphicsRuntime | null>(null);

/** Publishes the initialized renderer backend to one canvas subtree. */
export function GraphicsRuntimeProvider({
  children,
  runtime,
}: {
  readonly children: ReactNode;
  readonly runtime: GraphicsRuntime;
}) {
  return (
    <GraphicsRuntimeContext.Provider value={runtime}>
      {children}
    </GraphicsRuntimeContext.Provider>
  );
}

/** Returns the initialized backend for the canvas containing this component. */
export function useGraphicsRuntime(): GraphicsRuntime {
  const runtime = useContext(GraphicsRuntimeContext);
  if (!runtime) {
    throw new Error("Graphics runtime is unavailable before renderer init");
  }
  return runtime;
}
