import { useEffect, useRef, useState } from "react";
import { useFileUpload, createXhrTransport } from "@fiftyone/upload";
import type { FileUploadItem } from "@fiftyone/upload";

// Use XHR transport for real upload progress tracking
const transport = createXhrTransport();

const styles = {
  container: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: 600,
    margin: "40px auto",
    padding: 20,
  },
  dropZone: {
    border: "2px dashed #ccc",
    borderRadius: 8,
    padding: 40,
    textAlign: "center" as const,
    cursor: "pointer",
    transition: "border-color 0.2s, background-color 0.2s",
  },
  dropZoneActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  fileListContainer: {
    maxHeight: 300,
    overflowY: "auto" as const,
    marginTop: 20,
    padding: 12,
    border: "1px solid #e0e0e0",
    borderRadius: 6,
  },
  fileList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
    marginBottom: 8,
  },
  fileName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  progressBar: {
    width: 100,
    height: 6,
    backgroundColor: "#e0e0e0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4caf50",
    transition: "width 0.2s",
  },
  button: {
    padding: "8px 16px",
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: "#2196f3",
    color: "white",
  },
  secondaryButton: {
    backgroundColor: "#e0e0e0",
    color: "#333",
  },
  errorList: {
    backgroundColor: "#ffebee",
    color: "#c62828",
    padding: 12,
    borderRadius: 6,
    marginTop: 12,
  },
  totalProgressContainer: {
    marginTop: 16,
  },
  totalProgressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
  },
  totalProgressFill: {
    height: "100%",
    backgroundColor: "#4caf50",
    transition: "width 0.2s",
  },
  totalProgressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  thumbnailWrap: {
    width: 36,
    height: 36,
    borderRadius: 4,
    flexShrink: 0,
    overflow: "hidden",
    boxSizing: "border-box" as const,
    border: "2px solid transparent",
    transition: "border-color 0.2s, opacity 0.2s",
    position: "relative" as const,
  },
  thumbnailImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    display: "block",
  },
  fileIcon: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0e0e0",
    color: "#757575",
  },
};

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

const THUMB_SIZE = 72; // 2x the displayed 36px for retina

/**
 * Downscale a File to a tiny data-URL using an offscreen canvas.
 * The full-size blob is released as soon as the thumbnail is drawn.
 */
function createThumbnail(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(blobUrl);
      img.onload = null;
      img.onerror = null;
    };

    signal.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    });

    img.onload = () => {
      // Fit within THUMB_SIZE x THUMB_SIZE, preserving aspect ratio
      const scale = Math.min(
        THUMB_SIZE / img.width,
        THUMB_SIZE / img.height,
        1
      );
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      cleanup();
      // JPEG at 0.7 quality keeps thumbnails around 2-5 KB
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image"));
    };

    img.src = blobUrl;
  });
}

function statusBorder(status: string): string {
  if (status === "success") return "#4caf50";
  if (status === "error") return "#f44336";
  return "#ccc"; // selected, uploading, cancelled
}

function statusOpacity(status: string): number {
  if (status === "success") return 1;
  if (status === "error") return 1;
  return 0.45; // selected, uploading, cancelled
}

function FileThumbnail({ file, status }: { file: File; status: string }) {
  const isImage = file.type.startsWith("image/");
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    if (!isImage) return;
    const controller = new AbortController();
    createThumbnail(file, controller.signal)
      .then(setSrc)
      .catch(() => {});
    return () => controller.abort();
  }, [file, isImage]);

  const wrapStyle: React.CSSProperties = {
    ...styles.thumbnailWrap,
    borderColor: statusBorder(status),
    opacity: statusOpacity(status),
  };

  return (
    <div style={wrapStyle}>
      {isImage && src ? (
        <img src={src} alt="" style={styles.thumbnailImg} />
      ) : (
        <div style={styles.fileIcon}>
          <FileIcon />
        </div>
      )}
      {status === "success" && (
        <div
          style={{
            position: "absolute",
            bottom: -1,
            right: -1,
            width: 14,
            height: 14,
            borderRadius: "50%",
            backgroundColor: "#4caf50",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function FileItemRow({
  file,
  onCancel,
  onRetry,
}: {
  file: FileUploadItem;
  onCancel: (id: string) => Promise<void>;
  onRetry: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isOnServer = file.status === "success";

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopy = () => {
    if (!file.remotePath) return;
    navigator.clipboard.writeText(file.remotePath).then(() => {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleRemove = async () => {
    if (isOnServer) setDeleting(true);
    try {
      await onCancel(file.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <li
      style={{
        ...styles.fileItem,
        ...(deleting ? { opacity: 0.5, pointerEvents: "none" as const } : {}),
      }}
      data-testid={`file-item-${file.name}`}
    >
      <FileThumbnail file={file.file} status={file.status} />
      <span style={styles.fileName} title={file.name}>
        {file.name}
      </span>

      {deleting && (
        <span style={{ fontSize: 12, color: "#f44336" }}>Deleting…</span>
      )}

      <span style={{ fontSize: 12, color: "#666" }}>
        {(file.size / 1024).toFixed(1)} KB
      </span>

      {file.status === "uploading" && (
        <div style={styles.progressBar}>
          <div
            style={{ ...styles.progressFill, width: `${file.progress}%` }}
            data-testid={`progress-${file.name}`}
          />
        </div>
      )}

      {file.status === "error" && (
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => onRetry(file.id)}
          data-testid={`retry-${file.name}`}
        >
          Retry
        </button>
      )}

      {isOnServer && (
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
            color: copied ? "#4caf50" : "#999",
            transition: "color 0.2s",
          }}
          onClick={handleCopy}
          data-testid={`copy-path-${file.name}`}
          title={copied ? "Copied!" : `Copy path: ${file.remotePath}`}
        >
          {copied ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <CopyIcon />
          )}
        </button>
      )}

      <button
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          lineHeight: 1,
          color: isOnServer ? "#f44336" : "#999",
        }}
        onClick={handleRemove}
        disabled={deleting}
        data-testid={`remove-${file.name}`}
        title={
          isOnServer
            ? "Delete from server"
            : file.status === "uploading"
            ? "Cancel upload"
            : "Remove"
        }
      >
        {deleting ? <Spinner /> : isOnServer ? <TrashIcon /> : <CloseIcon />}
      </button>
    </li>
  );
}

export default function App() {
  const [destination, setDestination] = useState("/my/upload/dir");

  const {
    files,
    errors,
    clear,
    cancel,
    retry,
    cancelAll,
    dropProps,
    inputProps,
    browse,
    totalFiles,
    completedFiles,
    failedFiles,
    isUploading,
  } = useFileUpload({
    multiple: true,
    maxSize: 10 * 1024 * 1024, // 10MB
    maxSizeMessage: "File exceeds 10MB limit",
    transport, // XHR transport for real progress tracking
    autoUpload: {
      destination,
      endpoint: "/api/upload",
    },
  });

  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const dropZoneVisible = files.length === 0 || addMoreOpen;

  // Auto-close the drop zone when new files are added
  const fileCountRef = useRef(files.length);
  useEffect(() => {
    if (files.length > fileCountRef.current) {
      setAddMoreOpen(false);
    }
    fileCountRef.current = files.length;
  }, [files.length]);

  // Calculate total progress across all files
  const totalProgress =
    files.length > 0
      ? files.reduce((sum, f) => {
          if (f.status === "success") return sum + 100;
          if (f.status === "uploading") return sum + f.progress;
          if (f.status === "error" || f.status === "cancelled") return sum; // Don't count failed
          return sum; // selected = 0
        }, 0) / files.length
      : 0;

  const uploadingCount = files.filter((f) => f.status === "uploading").length;

  // Sort files: uploading first, then selected, then others
  const sortedFiles = [...files].sort((a, b) => {
    const priority: Record<string, number> = {
      uploading: 0,
      selected: 1,
      error: 2,
      cancelled: 3,
      success: 4,
    };
    return (priority[a.status] ?? 5) - (priority[b.status] ?? 5);
  });

  return (
    <div style={styles.container}>
      <h1>@fiftyone/upload Example</h1>

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="destination"
          style={{
            display: "block",
            fontSize: 13,
            color: "#666",
            marginBottom: 4,
          }}
        >
          Upload destination
        </label>
        <input
          id="destination"
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 4,
            boxSizing: "border-box",
            fontFamily: "monospace",
          }}
          data-testid="destination-input"
        />
      </div>

      {/* Hidden file input — always in the DOM so browse() works */}
      <input {...inputProps} data-testid="file-input" />

      {dropZoneVisible ? (
        <div
          {...dropProps}
          style={{
            ...styles.dropZone,
            ...(dropProps["data-dragging"] ? styles.dropZoneActive : {}),
          }}
          onClick={browse}
          data-testid="drop-zone"
        >
          <p>Drag & drop files here, or click to select</p>
          <p style={{ fontSize: 12, color: "#666" }}>Max file size: 10MB</p>
        </div>
      ) : null}

      {errors.length > 0 && (
        <div style={styles.errorList} data-testid="error-list">
          {errors.map((error, i) => (
            <div key={i}>{error}</div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* Total progress bar */}
          {(isUploading || completedFiles > 0) && (
            <div
              style={styles.totalProgressContainer}
              data-testid="total-progress"
            >
              <div style={styles.totalProgressBar}>
                <div
                  style={{
                    ...styles.totalProgressFill,
                    width: `${totalProgress}%`,
                    backgroundColor: failedFiles > 0 ? "#ff9800" : "#4caf50",
                  }}
                />
              </div>
              <div style={styles.totalProgressLabel}>
                <span>
                  {isUploading
                    ? `Uploading ${uploadingCount} file${
                        uploadingCount !== 1 ? "s" : ""
                      }...`
                    : `${completedFiles} of ${totalFiles} complete`}
                </span>
                <span>{Math.round(totalProgress)}%</span>
              </div>
            </div>
          )}

          {/* Scrollable file list */}
          <div style={styles.fileListContainer}>
            <ul style={styles.fileList} data-testid="file-list">
              {sortedFiles.map((file) => (
                <FileItemRow
                  key={file.id}
                  file={file}
                  onCancel={cancel}
                  onRetry={retry}
                />
              ))}
            </ul>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {!dropZoneVisible && (
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={() => setAddMoreOpen(true)}
                data-testid="add-more-button"
              >
                Add More Files
              </button>
            )}

            {isUploading && (
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={cancelAll}
                data-testid="cancel-all-button"
              >
                Cancel All
              </button>
            )}

            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={clear}
              data-testid="clear-button"
            >
              Clear All
            </button>
          </div>
        </>
      )}
    </div>
  );
}
