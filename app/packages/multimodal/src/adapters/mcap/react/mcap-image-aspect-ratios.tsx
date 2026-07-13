import { useTileId } from "@fiftyone/tiling";
import React, { createContext, useContext, useEffect } from "react";

type McapImageAspectRatioReporter = (
  tileId: string,
  aspectRatio: number | null,
) => void;

const McapImageAspectRatioContext =
  createContext<McapImageAspectRatioReporter | null>(null);

/** Props for the modal-scoped image aspect-ratio registry. */
export interface McapImageAspectRatioProviderProps {
  readonly children: React.ReactNode;
  readonly onChange: McapImageAspectRatioReporter;
}

/** Makes decoded image shapes available to the MCAP auto-layout strategy. */
export const McapImageAspectRatioProvider: React.FC<
  McapImageAspectRatioProviderProps
> = ({ children, onChange }) => (
  <McapImageAspectRatioContext.Provider value={onChange}>
    {children}
  </McapImageAspectRatioContext.Provider>
);

/** Publishes the surrounding image tile's decoded aspect ratio. */
export function usePublishMcapImageAspectRatio(
  aspectRatio: number | null,
): void {
  const tileId = useTileId();
  const report = useContext(McapImageAspectRatioContext);

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
