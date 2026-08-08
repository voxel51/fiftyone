import styles from "./Options.module.css";

import { Link, Selector, useTheme } from "@fiftyone/components";
import {
  useDismissable,
  useKeyBinding,
  useKeymapScope,
} from "@fiftyone/keymap";
import { CenterFocusWeak, Close, Help } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  activeField,
  geoFields,
  hasSelection,
  mapStyle,
  STYLES,
} from "./state";
import { useExternalLink } from "@fiftyone/utilities";
import { OperatorPlacements, types } from "@fiftyone/operators";

const useSearch = (search: string) => {
  const values = STYLES.filter((style) => style.includes(search));

  return { values };
};

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const Options: React.FC<{
  clearSelectionData: () => void;
  fitData: () => void;
  fitSelectionData: () => void;
}> = ({ clearSelectionData, fitSelectionData, fitData }) => {
  const theme = useTheme();
  const [style, setStyle] = useRecoilState(mapStyle);
  const fields = useRecoilValue(geoFields);
  const [field, setActiveField] = useRecoilState(activeField);
  const hasMapSelection = useRecoilValue(hasSelection);

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

  // Was a raw `window` keydown with no input guard and no scope check, so `f`
  // double-fired with the modal's fullscreen toggle whenever the Map panel was
  // mounted (§2.4). The scope makes them mutually exclusive; the shared text
  // guard stops it firing while you type.
  useKeymapScope("panel.map");
  useKeyBinding("fo.panel.map.fit-selection", fitSelectionData);
  useDismissable("map-panel", "Map selection", "panel.map", () => {
    reset();
    return true;
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
