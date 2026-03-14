import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileUploadItem } from "@fiftyone/upload";
import { MAX_HEIGHT, ROW_HEIGHT, OVERSCAN, STATUS_PRIORITY } from "./constants";

export function useVirtualizedFileList(files: FileUploadItem[]) {
  const sortedFiles = useMemo(
    () =>
      [...files].sort(
        (a, b) =>
          (STATUS_PRIORITY[a.status] ?? 5) - (STATUS_PRIORITY[b.status] ?? 5)
      ),
    [files]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    if (files.length === 0 && containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [files.length]);

  const totalHeight = sortedFiles.length * ROW_HEIGHT;
  const visibleCount = Math.ceil(MAX_HEIGHT / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    sortedFiles.length,
    startIndex + visibleCount + OVERSCAN * 2
  );

  return {
    sortedFiles,
    containerRef,
    handleScroll,
    totalHeight,
    startIndex,
    endIndex,
  };
}
