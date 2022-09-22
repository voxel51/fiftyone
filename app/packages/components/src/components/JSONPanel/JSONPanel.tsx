/**
 * Copyright 2017-2022, Voxel51, Inc.
 */
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
import closeIcon from "../../icons/close.svg";
import clipboardIcon from "../../icons/clipboard.svg";

function Close({ onClick }) {
  return (
    <img
      src={closeIcon}
      className={lookerCloseJSON}
      title="Close JSON"
      onClick={onClick}
    />
  );
}

function Copy({ onClick }) {
  return (
    <img
      src={clipboardIcon}
      className={lookerCopyJSON}
      title="Copy JSON to clipboard"
      onClick={onClick}
    />
  );
}

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
        <Close onClick={onClose} />
        <Copy onClick={onCopy} />
      </div>
    </div>
  );
}
