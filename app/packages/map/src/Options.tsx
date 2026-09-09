import styles from "./Options.module.css";

import { Link, Selector, useTheme } from "@fiftyone/components";
import { CenterFocusWeak, Close, Help } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  activeField,
  geoFields,
  hasSelection,
  mapboxStyle,
  maplibreStyle,
} from "./state";
import { getMapStyles, type MapProvider } from "./basemaps";
import useEventHandler from "./useEventHandler";
import { useExternalLink } from "@fiftyone/utilities";
import { OperatorPlacements, types } from "@fiftyone/operators";

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const Options: React.FC<{
  clearSelectionData: () => void;
  fitData: () => void;
  fitSelectionData: () => void;
  provider: MapProvider;
}> = ({ clearSelectionData, fitSelectionData, fitData, provider }) => {
  const theme = useTheme();
  const [mapboxStyleValue, setMapboxStyle] = useRecoilState(mapboxStyle);
  const [maplibreStyleValue, setMaplibreStyle] = useRecoilState(maplibreStyle);
  const fields = useRecoilValue(geoFields);
  const [field, setActiveField] = useRecoilState(activeField);
  const hasMapSelection = useRecoilValue(hasSelection);
  const style = provider === "mapbox" ? mapboxStyleValue : maplibreStyleValue;
  const setStyle = provider === "mapbox" ? setMapboxStyle : setMaplibreStyle;
  const useSearch = React.useCallback(
    (search: string) => ({
      values: getMapStyles(provider).filter((style) => style.includes(search)),
    }),
    [provider],
  );

  const selectorStyle = {
    background: theme.neutral.softBg,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };
  const reset = React.useCallback(() => {
    clearSelectionData();
    fitData();
  }, [clearSelectionData, fitData]);

  useEventHandler(window, "keydown", ({ key }: KeyboardEvent) => {
    switch (key) {
      case "Escape":
        reset();
        break;
      case "f":
        fitSelectionData();
        break;
    }
  });

  return (
    <div className={styles.options}>
      <div>
        <Selector
          placeholder={"Map Style"}
          value={style}
          onSelect={setStyle}
          useSearch={useSearch}
          component={Value}
          containerStyle={selectorStyle}
          overflow={true}
        />
        {fields.length > 1 && (
          <Selector
            placeholder={"Field"}
            value={field}
            onSelect={setActiveField}
            useSearch={() => {
              return { values: fields };
            }}
            component={Value}
            containerStyle={selectorStyle}
            overflow={true}
          />
        )}
      </div>

      <div>
        {hasMapSelection && (
          <Link to={reset} className={styles.link} title={"Reset (Esc)"}>
            <Close />
          </Link>
        )}

        <Link
          to={fitSelectionData}
          className={styles.link}
          title={"Fit data (f)"}
        >
          <CenterFocusWeak />
        </Link>

        <Link
          className={styles.link}
          href={"https://docs.voxel51.com/user_guide/app.html#map-panel"}
          title={"Help"}
          to={useExternalLink("https://docs.voxel51.com")}
          target={"_blank"}
        >
          <Help />
        </Link>
        <OperatorPlacements place={types.Places.MAP_ACTIONS} />
      </div>
    </div>
  );
};

export default Options;
