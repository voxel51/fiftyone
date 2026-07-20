import { useTileId } from "@fiftyone/tiling";
import React, { createContext, useContext, useEffect } from "react";

type EpisodeImageAspectRatioReporter = (
  tileId: string,
  aspectRatio: number | null,
) => void;

const EpisodeImageAspectRatioContext =
  createContext<EpisodeImageAspectRatioReporter | null>(null);

/** Props for the modal-scoped image aspect-ratio registry. */
export interface EpisodeImageAspectRatioProviderProps {
  readonly children: React.ReactNode;
  readonly onChange: EpisodeImageAspectRatioReporter;
}

/** Makes decoded image shapes available to the episode auto-layout strategy. */
export const EpisodeImageAspectRatioProvider: React.FC<
  EpisodeImageAspectRatioProviderProps
> = ({ children, onChange }) => (
  <EpisodeImageAspectRatioContext.Provider value={onChange}>
    {children}
  </EpisodeImageAspectRatioContext.Provider>
);

/** Publishes the surrounding image tile's decoded aspect ratio. */
export function usePublishEpisodeImageAspectRatio(
  aspectRatio: number | null,
): void {
  const tileId = useTileId();
  const report = useContext(EpisodeImageAspectRatioContext);

  // This effect registers the decoded image shape for the tile's lifetime.
  useEffect(() => {
    if (
      !report ||
      !tileId ||
      aspectRatio === null ||
      !Number.isFinite(aspectRatio) ||
      aspectRatio <= 0
    ) {
      return undefined;
    }
    report(tileId, aspectRatio);
    return () => report(tileId, null);
  }, [aspectRatio, report, tileId]);
}
