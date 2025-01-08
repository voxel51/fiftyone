/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import {
  Close as CloseIcon,
  Copy as CopyIcon,
  JSONViewer,
  scrollable,
} from "@fiftyone/components";
import React, { useEffect } from "react";
import jsonStyles from "./json.module.css";
import panelStyles from "./panel.module.css";

export default function JSONPanel(props: JSONPanelPropsType) {
  const { containerRef, onClose, onCopy, json } = props;
  const parsed = JSON.parse(json);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className={`${jsonStyles.lookerJSONPanel} ${panelStyles.lookerPanelContainer}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={panelStyles.lookerPanelVerticalContainer}>
        <div className={panelStyles.lookerPanel}>
          {parsed && (
            <JSONViewer
              value={parsed}
              containerProps={{ style: { height: "100%" } }}
              searchContainerProps={{ style: { width: "calc(100% - 72px)" } }}
              jsonViewerProps={{
                className: scrollable,
                style: {
                  overflow: "auto",
                  maxWidth: "60vw",
                  minWidth: "60vw",
                  height: "calc(100% - 48px)",
                },
              }}
            />
          )}
        </div>
        <CloseIcon
          className={jsonStyles.lookerCloseJSON}
          titleAccess="Close JSON"
          onClick={onClose}
          sx={{
            fontSize: "1.75rem",
            margin: "1.5rem",
          }}
        />
        <CopyIcon
          className={jsonStyles.lookerCopyJSON}
          titleAccess="Copy JSON to clipboard"
          onClick={onCopy}
          sx={{
            fontSize: "1.75rem",
            margin: "1.5rem",
          }}
        />
      </div>
    </div>
  );
}

type JSONPanelPropsType = {
  containerRef: React.RefObject<HTMLDivElement | undefined>;
  onClose: () => void;
  onCopy: () => void;
  json: string | null;
};
