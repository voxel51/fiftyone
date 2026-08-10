/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  Close as CloseIcon,
  Copy as CopyIcon,
  JSONViewer,
  scrollable,
} from "@fiftyone/components";
import { useDismissable } from "@fiftyone/keymap";
import React from "react";
import jsonStyles from "./json.module.css";
import panelStyles from "./panel.module.css";

export default function JSONPanel(props: JSONPanelPropsType) {
  const { containerRef, onClose, onCopy, json } = props;
  const parsed = JSON.parse(json);

  // An open JSON panel is a dismissal layer, not an Escape shortcut. As a raw
  // `window` listener this closed the panel *and* let the same Escape reach the
  // modal and the grid, because nothing arbitrated between them.
  useDismissable("json-panel", "JSON panel", "overlay.dialog", () => {
    onClose();
    return true;
  });

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
