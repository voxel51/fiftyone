import { useCallback, useMemo, useState } from "react";

export function useFileDrop(onFiles: (files: File[]) => void) {
  const [isDragActive, setIsDragActive] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      onFiles(Array.from(e.dataTransfer.files as unknown as File[]));
    },
    [onFiles]
  );

  return useMemo(
    () => ({ onDragOver, onDragLeave, onDrop, isDragActive }),
    [onDragOver, onDragLeave, onDrop, isDragActive]
  );
}
