import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useState } from "react";

/**
 * Resolves an image URL into a browser-local object URL before passing it to
 * Three. This keeps frustum textures from depending on cross-origin <img>
 * cache state when the app and media server are served from different origins.
 */
export function useFrustumTextureUrl(
  imageUrl: string | null | undefined,
): string | null {
  const [textureUrl, setTextureUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setTextureUrl(null);
      return;
    }

    if (
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      setTextureUrl(imageUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setTextureUrl(null);

    const fetchTexture = async () => {
      try {
        const fetch = getFetchFunction();
        const blob = await fetch<undefined, Blob>(
          "GET",
          imageUrl,
          undefined,
          "blob",
        );

        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setTextureUrl(objectUrl);
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load frustum texture image", {
            imageUrl,
            error,
          });
          setTextureUrl(null);
        }
      }
    };

    fetchTexture();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageUrl]);

  return textureUrl;
}
