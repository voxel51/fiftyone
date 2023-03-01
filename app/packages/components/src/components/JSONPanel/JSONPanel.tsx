/**
 * Copyright 2017-2023, Voxel51, Inc.
 */
import { useState } from "react";
import { Copy as CopyIcon, Close as CloseIcon } from "@fiftyone/components";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelVerticalContainer,
  searchContainer,
  searchInput,
  copyBtnClass,
  searchCloseIcon,
} from "./panel.module.css";
import {
  lookerCopyJSON,
  lookerCloseJSON,
  lookerJSONPanel,
} from "./json.module.css";
import ReactJson from "searchable-react-json-view";
import { useColorScheme } from "@mui/material";

export default function JSONPanel({ containerRef, onClose, onCopy, json }) {
  const parsed = JSON.parse(json);
  const { mode } = useColorScheme();
  const isDarkMode = mode === "dark";
  const [searchTerm, setSearchTerm] = useState<string>("");

  return (
    <div
      ref={containerRef}
      className={`${lookerJSONPanel} ${lookerPanelContainer}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={lookerPanelVerticalContainer}>
        <div className={lookerPanel}>
          {parsed && (
            <div style={{ position: "relative" }}>
              <div className={searchContainer}>
                <input
                  placeholder="Search to highlight text..."
                  className={searchInput}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  value={searchTerm}
                />
                {searchTerm && (
                  <CloseRoundedIcon
                    className={searchCloseIcon}
                    onClick={() => setSearchTerm("")}
                  />
                )}
              </div>
              <ReactJson
                highlightSearch={searchTerm}
                src={parsed}
                theme={`ashes${!isDarkMode ? ":inverted" : ""}`}
                style={{
                  padding: "1rem 1rem 2rem 1rem",
                  overflowX: "scroll",
                  maxWidth: "60vw",
                  minWidth: "60vw",
                  minHeight: "70vh",
                }}
                iconStyle="square"
                indentWidth={2}
                customCopyIcon={<CopyIcon style={{ fontSize: "11px" }} />}
                customCopiedIcon={
                  <CopyIcon
                    className={copyBtnClass}
                    style={{ fontSize: "11px" }}
                  />
                }
              />
            </div>
          )}
        </div>
        <CloseIcon
          className={lookerCloseJSON}
          titleAccess="Close JSON"
          onClick={onClose}
          sx={{
            fontSize: "1.75rem",
            margin: "1.5rem",
          }}
        />
        <CopyIcon
          className={lookerCopyJSON}
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
