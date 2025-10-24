import { Checkbox, FormControlLabel } from "@mui/material";
import { useKey } from "../hooks";
import { getComponentProps } from "../utils";
import autoFocus from "../utils/auto-focus";
import HeaderView from "./HeaderView";

export default function CheckboxView(props) {
  const { onChange, path, schema, data } = props;
  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FormControlLabel
      control={
        <Checkbox
          key={key}
          disabled={schema.view?.readOnly}
          autoFocus={autoFocus(props)}
          defaultChecked={data === true}
          onChange={(e, value) => {
            onChange(path, value);
            setUserChanged();
          }}
          {...getComponentProps(props, "checkbox")}
        />
      }
      label={<HeaderView {...props} nested />}
      {...getComponentProps(props, "container")}
    />
  );
}
