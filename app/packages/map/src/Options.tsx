import { link, options } from "./Options.module.css";

import { Link, Selector, useTheme } from "@fiftyone/components";
import { CenterFocusWeak, Close, Help } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import {
  activeField,
  geoFields,
  hasSelection,
  mapStyle,
  STYLES,
} from "./state";
import useEventHandler from "./useEventHandler";
import { useExternalLink } from "@fiftyone/utilities";
import { OperatorPlacements, types } from "@fiftyone/operators";
import useMapSelection from "./useMapSelection";

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
  const [extendedSelection, setExtendedSelection] = useRecoilState(fos.extendedSelection);

  // Use the map selection hook to get the current geo selection
  const mapSelection = useMapSelection();

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

  // When the field changes, update both the activeField atom and geoSelection.field if present
  const onFieldChange = React.useCallback(
    (newField: string) => {
      setActiveField(newField);
      if (extendedSelection.geoSelection) {
        setExtendedSelection({
          ...extendedSelection,
          geoSelection: {
            ...extendedSelection.geoSelection,
            field: newField,
          },
        });
      }
    },
    [setActiveField, extendedSelection, setExtendedSelection]
  );

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
    <div className={options}>
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
            onSelect={onFieldChange}
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
          <Link to={reset} className={link} title={"Reset (Esc)"}>
            <Close />
          </Link>
        )}

        <Link to={fitSelectionData} className={link} title={"Fit data (f)"}>
          <CenterFocusWeak />
        </Link>

        <Link
          className={link}
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
