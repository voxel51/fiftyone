import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { InsertDriveFile, PlayCircle } from "@mui/icons-material";
import { queueThumbnail, isImageFile, isVideoFile } from "@fiftyone/upload";

const THUMB_DISPLAY = 36;

interface FileThumbnailProps {
  file: File;
  status: string;
}

function statusBorderColor(status: string): string {
  if (status === "success") return "success.main";
  if (status === "error") return "error.main";
  return "divider";
}

function statusOpacity(status: string): number {
  if (status === "success" || status === "error") return 1;
  return 0.45;
}

export default function FileThumbnail({ file, status }: FileThumbnailProps) {
  const isImage = isImageFile(file);
  const isVideo = isVideoFile(file);
  const [src, setSrc] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasBeenVisible = useRef(false);

  // Only start thumbnail generation once the element is scrolled into view
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

  return (
    <Box
      ref={containerRef}
      sx={{
        width: THUMB_DISPLAY,
        height: THUMB_DISPLAY,
        borderRadius: 1,
        flexShrink: 0,
        overflow: "hidden",
        border: 2,
        borderColor: statusBorderColor(status),
        opacity: statusOpacity(status),
        transition: "border-color 0.2s, opacity 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "action.hover",
      }}
    >
      {isImage && src ? (
        <Box
          component="img"
          src={src}
          alt=""
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : isVideo ? (
        <PlayCircle sx={{ fontSize: 20, color: "text.secondary" }} />
      ) : (
        <InsertDriveFile sx={{ fontSize: 20, color: "text.secondary" }} />
      )}
    </Box>
  );
}
