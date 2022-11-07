/**
 * Copyright 2017-2022, Voxel51, Inc.
 */
import { Copy as CopyIcon, Close as CloseIcon } from "@fiftyone/components";
import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelVerticalContainer,
} from "./panel.module.css";
import {
  lookerCopyJSON,
  lookerCloseJSON,
  lookerJSONPanel,
} from "./json.module.css";

export default function JSONPanel({ containerRef, jsonHTML, onClose, onCopy }) {
  return (
    <div
      ref={containerRef}
      className={`${lookerJSONPanel} ${lookerPanelContainer}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={lookerPanelVerticalContainer}>
        <div className={lookerPanel}>
          {jsonHTML && <pre dangerouslySetInnerHTML={jsonHTML} />}
        </div>
        <CloseIcon
          className={lookerCloseJSON}
          titleAccess="Close JSON"
          onClick={onClose}
          sx={{
            fontSize: "1.75rem",
          }}
        />
        <CopyIcon
          className={lookerCopyJSON}
          titleAccess="Copy JSON to clipboard"
          onClick={onCopy}
          sx={{
            fontSize: "1.75rem",
          }}
        />
      </div>
    </div>
  );
}
