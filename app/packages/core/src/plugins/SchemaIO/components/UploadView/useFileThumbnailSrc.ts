import { useEffect, useRef, useState } from "react";
import { queueThumbnail, isImageFile } from "@fiftyone/upload";

/**
 * Lazily generates and returns a thumbnail data-URL for an image file.
 * Defers work until the element attached to the returned ref scrolls into view.
 */
export function useFileThumbnailSrc(file: File) {
  const isImage = isImageFile(file);
  const [src, setSrc] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasBeenVisible = useRef(false);

  useEffect(() => {
    if (!isImage || hasBeenVisible.current) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasBeenVisible.current = true;
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isImage]);

  useEffect(() => {
    if (!isImage || !hasBeenVisible.current) return;
    const controller = new AbortController();
    queueThumbnail(file, controller.signal)
      .then(setSrc)
      .catch(() => {});
    return () => controller.abort();
  }, [file, isImage, hasBeenVisible.current]);

  return { src, containerRef };
}
