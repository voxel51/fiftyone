import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box } from "@mui/material";
import type { FileUploadItem } from "@fiftyone/upload";
import UploadFileItem from "./UploadFileItem";

const MAX_HEIGHT = 300;
const ROW_HEIGHT = 52;
const OVERSCAN = 5;

const STATUS_PRIORITY: Record<string, number> = {
  uploading: 0,
  selected: 1,
  error: 2,
  cancelled: 3,
  success: 4,
};

interface UploadFileListProps {
  files: FileUploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

export default function UploadFileList({
  files,
  onCancel,
  onRetry,
}: UploadFileListProps) {
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

  // Reset scroll when files change significantly (e.g. clear)
  useEffect(() => {
    if (files.length === 0 && containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [files.length]);

  if (files.length === 0) return null;

  const totalHeight = sortedFiles.length * ROW_HEIGHT;
  const visibleCount = Math.ceil(MAX_HEIGHT / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    sortedFiles.length,
    startIndex + visibleCount + OVERSCAN * 2
  );

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      sx={{
        mt: 1.5,
        maxHeight: MAX_HEIGHT,
        overflowY: "auto",
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        position: "relative",
      }}
    >
      <Box sx={{ height: totalHeight, position: "relative" }}>
        {sortedFiles.slice(startIndex, endIndex).map((item, i) => (
          <Box
            key={item.id}
            sx={{
              position: "absolute",
              top: (startIndex + i) * ROW_HEIGHT,
              left: 0,
              right: 0,
              height: ROW_HEIGHT,
              px: 1.5,
              display: "flex",
              alignItems: "center",
            }}
          >
            <UploadFileItem item={item} onCancel={onCancel} onRetry={onRetry} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
