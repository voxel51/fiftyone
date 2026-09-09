import { useTileId } from "@fiftyone/tiling";
import React, { createContext, useContext, useEffect } from "react";

type ImageAspectRatioReporter = (
  tileId: string,
  aspectRatio: number | null,
) => void;

const ImageAspectRatioContext = createContext<ImageAspectRatioReporter | null>(
  null,
);

/** Props for the modal-scoped image aspect-ratio registry. */
export interface ImageAspectRatioProviderProps {
  readonly children: React.ReactNode;
  readonly onChange: ImageAspectRatioReporter;
}

/** Makes decoded image shapes available to the episode auto-layout strategy. */
export const ImageAspectRatioProvider: React.FC<
  ImageAspectRatioProviderProps
> = ({ children, onChange }) => (
  <ImageAspectRatioContext.Provider value={onChange}>
    {children}
  </ImageAspectRatioContext.Provider>
);

/** Publishes the surrounding image tile's decoded aspect ratio. */
export function usePublishImageAspectRatio(aspectRatio: number | null): void {
  const tileId = useTileId();
  const report = useContext(ImageAspectRatioContext);

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
