import { createContext, useContext, type ReactNode } from "react";

import type { EpisodePosterFrame } from "../../../ir";

type SourcePosterImage = Extract<
  EpisodePosterFrame,
  { readonly kind: "image" }
>;

export interface SourcePosterValue {
  readonly frame: SourcePosterImage["image"];
  readonly sourceKey: string;
  readonly streamId: string | null;
}

const SourcePosterContext = createContext<SourcePosterValue | null>(null);

/** Supplies a source-authenticated grid poster to destination modal tiles. */
export function SourcePosterProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: SourcePosterValue | null;
}) {
  return (
    <SourcePosterContext.Provider value={value}>
      {children}
    </SourcePosterContext.Provider>
  );
}

/** Returns the current source's destination poster, when the grid captured one. */
export function useSourcePoster(): SourcePosterValue | null {
  return useContext(SourcePosterContext);
}
