/**
 * Copyright 2017-2022, Voxel51, Inc.
 */
import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelVerticalContainer,
  lookerPanelClose,
} from "./panel.module.css";
import { lookerCopyJSON, lookerJSONPanel } from "./json.module.css";
import closeIcon from "../../icons/close.svg";
import clipboardIcon from "../../icons/clipboard.svg";

function Close({ onClick }) {
  return (
    <img
      src={closeIcon}
      className={lookerPanelClose}
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

export default function JSONPanel({ json }) {
  return (
    <div className={`${lookerJSONPanel} ${lookerPanelContainer}`}>
      <div className={lookerPanelVerticalContainer}>
        <div className={lookerPanel} onClick={(e) => e.stopPropagation()}>
          <pre>{json}</pre>
        </div>
        <Close />
        <Copy />
      </div>
    </div>
  );
}
