import { link, options } from "./Options.module.css";

import { Link, Selector, useTheme } from "@fiftyone/components";
import { Close, CropFree, Help } from "@material-ui/icons";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  activeField,
  geoFields,
  hasSelection,
  mapStyle,
  STYLES,
} from "./state";

const useSearch = (search: string) => {
  const values = STYLES.filter((style) => style.includes(search));

  return { values };
};

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const Options: React.FC<{
  fitData: () => void;
  fitSelectionData: () => void;
}> = ({ fitSelectionData, fitData }) => {
  const theme = useTheme();
  const [style, setStyle] = useRecoilState(mapStyle);
  const fields = useRecoilValue(geoFields);
  const [field, setActiveField] = useRecoilState(activeField);
  const [selection, setSelection] = useRecoilState(hasSelection);

  const selectorStyle = {
    background: theme.backgroundTransparent,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };

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
        {selection && (
          <Link className={link} title={"Reset (Esc)"}>
            <Close
              onClick={() => {
                setSelection(false);
                fitData();
              }}
            />
          </Link>
        )}

        <Link className={link} title={"Fit data (F)"}>
          <CropFree onClick={fitSelectionData} />
        </Link>

        <Link className={link} to={"https://docs.voxel51.com"} title={"Help"}>
          <Help />
        </Link>
      </div>
    </div>
  );
};

export default Options;
