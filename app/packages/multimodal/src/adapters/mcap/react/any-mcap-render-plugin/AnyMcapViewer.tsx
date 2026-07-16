import {
  Button,
  Divider,
  ExitWorkspaceIcon,
  ExternalLinkIcon,
  Input,
  InputType,
  Size,
  Text,
  TextColor,
  TextVariant,
  UploadIcon,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../../query/bytes";
import { McapSourcePlayback } from "../McapSourcePlayback";
import { useMcapResourceClient } from "../use-mcap-resource-client";
import {
  createLocalMcapSourceDescriptor,
  createRemoteMcapSourceDescriptor,
} from "./source-descriptors";
import styles from "./AnyMcapViewer.module.css";

type ActiveAnyMcapSource = {
  readonly fileName: string;
  readonly kind: "file" | "url";
  readonly source: ByteSourceDescriptor;
};

type ViewerError = {
  readonly message: string;
  readonly target: "file" | "url";
};

const AnyMcapViewer: React.FC = () => {
  const [active, setActive] = useState<ActiveAnyMcapSource | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<ViewerError | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const client = useMcapResourceClient({ worker: true });

  const clearActive = useCallback(() => {
    dragDepthRef.current = 0;
    setActive(null);
    setDragging(false);
    setError(null);
  }, []);

  const openFile = useCallback((file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      const descriptor = createLocalMcapSourceDescriptor(file);
      setActive({
        fileName: descriptor.fileName,
        kind: "file",
        source: descriptor.source,
      });
      setError(null);
    } catch (caught) {
      setError({ message: errorMessage(caught), target: "file" });
    }
  }, []);

  const openUrl = useCallback(() => {
    try {
      const descriptor = createRemoteMcapSourceDescriptor(urlInput);
      setActive({
        fileName: descriptor.fileName,
        kind: "url",
        source: descriptor.source,
      });
      setError(null);
    } catch (caught) {
      setError({ message: errorMessage(caught), target: "url" });
    }
  }, [urlInput]);

  const handleDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (active) {
        return;
      }

      dragDepthRef.current += 1;
      setDragging(true);
    },
    [active],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = active ? "none" : "copy";
      if (active) {
        return;
      }

      setDragging(true);
    },
    [active],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (active) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragging(false);
      }
    },
    [active],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setDragging(false);
      if (active) {
        return;
      }

      openFile(fileFromDataTransfer(event.dataTransfer));
    },
    [active, openFile],
  );

  const browse = useCallback(() => fileInputRef.current?.click(), []);

  return (
    <div
      className={styles.root}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {active ? (
        <div className={styles.playback}>
          <McapSourcePlayback
            key={active.source.sourceId}
            client={client}
            fileName={active.fileName}
            headerActions={
              <Button
                className={styles.unmountButton}
                data-testid="any-mcap-unmount"
                onClick={clearActive}
                size={Size.Xs}
                leadingIcon={ExitWorkspaceIcon}
                variant={Variant.Secondary}
              >
                Unmount recording
              </Button>
            }
            layoutScopeKey={`any-mcap:${active.source.sourceId}`}
            source={active.source}
          />
        </div>
      ) : (
        <div className={styles.hero}>
          <input
            accept=".mcap"
            aria-label="Choose local MCAP file"
            className={styles.fileInput}
            data-testid="local-mcap-input"
            onChange={(event) => {
              openFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />

          <div
            aria-label="Drop an MCAP file or click to browse"
            className={`${styles.dropZone} ${
              dragging ? styles.dropZoneActive : ""
            }`}
            data-testid="local-mcap-drop-zone"
            onClick={browse}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                browse();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className={styles.dropZoneIcon}>
              <UploadIcon size={Size.Lg} />
            </div>
            <Text className={styles.dropZoneTitle} variant={TextVariant.Lg}>
              Drag &amp; drop an MCAP file
            </Text>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              or <span className={styles.browseLink}>click to browse</span>
            </Text>
            <Text
              className={styles.dropZoneHint}
              variant={TextVariant.Xs}
              color={TextColor.Secondary}
            >
              .mcap &middot; files stay in this browser session and are read
              directly
            </Text>
          </div>

          {error?.target === "file" ? (
            <Text className={styles.error} variant={TextVariant.Xs}>
              {error.message}
            </Text>
          ) : null}

          <Divider className={styles.divider} label="or open from a URL" />

          <form
            className={styles.urlForm}
            onSubmit={(event) => {
              event.preventDefault();
              openUrl();
            }}
          >
            <Input
              aria-label="Remote MCAP URL"
              error={error?.target === "url"}
              icon={ExternalLinkIcon}
              onChange={(event) => {
                setUrlInput(event.target.value);
                if (error?.target === "url") {
                  setError(null);
                }
              }}
              placeholder="https://example.com/recording.mcap"
              size={Size.Sm}
              type={InputType.Url}
              value={urlInput}
            />
            <Button
              disabled={urlInput.trim().length === 0}
              size={Size.Sm}
              type="submit"
            >
              Open URL
            </Button>
          </form>

          {error?.target === "url" ? (
            <Text className={styles.error} variant={TextVariant.Xs}>
              {error.message}
            </Text>
          ) : (
            <Text
              className={styles.urlHint}
              variant={TextVariant.Xs}
              color={TextColor.Secondary}
            >
              HTTP(S) sources must support CORS and byte-range reads.
            </Text>
          )}
        </div>
      )}
    </div>
  );
};

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Could not open MCAP";
}

function isFileDrag(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.files?.length > 0) {
    return true;
  }

  if (
    Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")
  ) {
    return true;
  }

  return Array.from(dataTransfer.types ?? []).includes("Files");
}

function fileFromDataTransfer(dataTransfer: DataTransfer): File | undefined {
  const droppedFile = dataTransfer.files?.[0];
  if (droppedFile) {
    return droppedFile;
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }

  return undefined;
}

export default AnyMcapViewer;
