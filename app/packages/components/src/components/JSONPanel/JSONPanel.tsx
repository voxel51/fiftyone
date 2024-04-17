/**
 * Copyright 2017-2024, Voxel51, Inc.
 */
import { Close as CloseIcon, Copy as CopyIcon } from "@fiftyone/components";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useColorScheme } from "@mui/material";
import { JsonViewer } from "@textea/json-viewer";
import React, { useEffect, useMemo, useState } from "react";
import { KeyRendererWrapper, getValueRenderersForSearch } from "./highlight";
import {
  lookerCloseJSON,
  lookerCopyJSON,
  lookerJSONPanel,
} from "./json.module.css";
import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelVerticalContainer,
  searchCloseIcon,
  searchContainer,
  searchInput,
} from "./panel.module.css";

export default function JSONPanel({ containerRef, onClose, onCopy, json }) {
  const parsed = JSON.parse(json);
  const { mode } = useColorScheme();
  const isDarkMode = mode === "dark";
  const [searchTerm, setSearchTerm] = useState<string>("");

  const keyRenderer = useMemo(
    () => KeyRendererWrapper(searchTerm),
    [searchTerm]
  );

  const valuesRenderer = useMemo(
    () => getValueRenderersForSearch(searchTerm),
    [searchTerm]
  );

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
              <JsonViewer
                value={parsed}
                rootName={false}
                objectSortKeys={true}
                indentWidth={2}
                keyRenderer={keyRenderer}
                valueTypes={valuesRenderer}
                quotesOnKeys={false}
                theme={isDarkMode ? "dark" : "light"}
                style={{
                  padding: "1rem 1rem 2rem 1rem",
                  overflowX: "scroll",
                  maxWidth: "60vw",
                  minWidth: "60vw",
                  minHeight: "70vh",
                }}
              />

              {/* <ReactJson
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
              /> */}
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
