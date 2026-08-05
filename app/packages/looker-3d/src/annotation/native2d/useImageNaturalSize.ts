import { useEffect, useState } from "react";

export interface ImageSize {
  w: number;
  h: number;
}

/**
 * Resolves the natural (pixel) dimensions of an image URL. Used to size the 2D
 * overlay's SVG viewBox so normalized label coordinates map to the same
 * `object-fit: contain` box the <img> is displayed in.
 *
 * The browser caches the decoded image (the slice <img> loads the same URL), so
 * this is effectively free after the first paint.
 */
export const useImageNaturalSize = (url: string | null): ImageSize | null => {
  const [size, setSize] = useState<ImageSize | null>(null);

  useEffect(() => {
    if (!url) {
      setSize(null);
      return undefined;
    }

    let cancelled = false;
    setSize(null);
    const img = new Image();

    const apply = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };

    img.onload = apply;
    img.onerror = () => {
      if (!cancelled) {
        console.warn(`Failed to load image for natural-size lookup: ${url}`);
      }
    };
    img.src = url;

    // Already cached/decoded.
    if (img.complete) {
      apply();
    }

    return () => {
      cancelled = true;
    };
  }, [url]);

  return size;
};
