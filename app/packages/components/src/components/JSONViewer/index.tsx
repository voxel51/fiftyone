import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useColorScheme } from "@mui/material";
import { JsonViewer, JsonViewerProps } from "@textea/json-viewer";
import React, { useEffect, useMemo, useState } from "react";
import { KeyRendererWrapper, getValueRenderersForSearch } from "./highlight";
import styles from "./index.module.css";
import { debounce } from "lodash";

const SEARCH_DEBOUNCE = 250;

export default function JSONViewer(props: JSONViewerPropsType) {
  const {
    value,
    resetSearchOnEscape = true,
    searchContainerProps = {},
    containerProps = {},
    jsonViewerProps = {},
  } = props;
  const { mode } = useColorScheme();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>("");

  const isDarkMode = mode === "dark";
  const parsed = value;

  const handleSetDebouncedSearchTerm = useMemo(() => {
    return debounce(
      (searchTerm: string) => {
        setDebouncedSearchTerm(searchTerm);
      },
      SEARCH_DEBOUNCE,
      { leading: true }
    );
  }, [setDebouncedSearchTerm]);

  const keyRenderer = useMemo(
    () => KeyRendererWrapper(debouncedSearchTerm),
    [debouncedSearchTerm]
  );

  const valuesRenderer = useMemo(
    () => getValueRenderersForSearch(debouncedSearchTerm),
    [debouncedSearchTerm]
  );

  useEffect(() => {
    handleSetDebouncedSearchTerm(searchTerm);
  }, [handleSetDebouncedSearchTerm, searchTerm]);

  return (
    <div
      {...containerProps}
      style={{ position: "relative", ...(containerProps.style || {}) }}
    >
      <div className={styles.searchContainer} {...searchContainerProps}>
        <input
          placeholder="Search to highlight text..."
          className={styles.searchInput}
          onChange={(e) => setSearchTerm(e.target.value)}
          value={searchTerm}
          onKeyDown={(e) => {
            if (e.key === "Escape" && resetSearchOnEscape && searchTerm) {
              setSearchTerm("");
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
        {searchTerm && (
          <CloseRoundedIcon
            className={styles.searchCloseIcon}
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
        {...jsonViewerProps}
      />
    </div>
  );
}

type JSONViewerPropsType = {
  value?: JSON;
  resetSearchOnEscape?: boolean;
  jsonViewerProps?: Omit<JsonViewerProps, "value">;
  searchContainerProps?: React.HTMLProps<HTMLInputElement>;
  containerProps?: React.HTMLProps<HTMLDivElement>;
};
