import { FormControlLabel, Switch } from "@mui/material";
import { HeaderView } from ".";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function SwitchView(props) {
  const { onChange, path, schema, data } = props;

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FormControlLabel
      control={
        <Switch
          key={key}
          disabled={schema.view?.readOnly}
          autoFocus={autoFocus(props)}
          defaultChecked={data === true}
          onChange={(_e, checked) => {
            onChange(path, checked);
            setUserChanged();
          }}
          {...getComponentProps(props, "switch")}
        />
      }
      label={<HeaderView {...props} nested />}
      {...getComponentProps(props, "container")}
    />
  );
}
