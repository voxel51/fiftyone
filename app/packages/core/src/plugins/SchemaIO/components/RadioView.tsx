import {
  FormControl,
  FormControlLabel,
  FormLabel,
  RadioGroup as MUIRadioGroup,
  Radio,
} from "@mui/material";
import { useMemo } from "react";
import { ButtonView, HeaderView } from ".";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function RadioView(props: RadioGroupProps) {
  const { schema, onChange, path, data } = props;
  const { view = {} } = schema;
  const {
    choices,
    label,
    description,
    orientation,
    readOnly,
    variant = "default",
  } = view;

  const useButtons = variant === "button";
  const [key, setUserChanged] = useKey(path, schema, data, true);

  const radioGroupSx = useMemo(() => {
    const choicesLen = choices.length;
    if (useButtons && choicesLen > 0) {
      return {
        "> label": {
          width: choicesLen === 1 ? "100%" : "50%",
          margin: "0",
          padding: ".25rem",
          boxSizing: "border-box",
        },
      };
    }
    return { alignItems: "flex-start" };
  }, [useButtons, choices]);

  return (
    <FormControl {...getComponentProps(props, "container")}>
      {(label || description) && (
        <FormLabel
          sx={{ pb: 1 }}
          {...getComponentProps(props, "headerContainer")}
        >
          <HeaderView {...props} nested />
        </FormLabel>
      )}
      <MUIRadioGroup
        key={key}
        defaultValue={data}
        onChange={(_e, value) => {
          onChange(path, value);
          setUserChanged();
        }}
        sx={radioGroupSx}
        row={orientation !== "vertical"}
        {...getComponentProps(props, "radioGroup")}
      >
        {choices.map(
          (
            { value, label, description, caption, icon, disabled = false },
            i,
          ) => (
            <FormControlLabel
              key={value}
              value={value}
              disabled={readOnly || disabled}
              control={
                useButtons ? (
                  <ButtonView
                    schema={{
                      view: {
                        label,
                        icon,
                        disabled: readOnly || disabled,
                        componentsProps: {
                          container: { width: "100%" },
                          button: {
                            sx: {
                              width: "100%",
                              background: "none",
                              justifyContent: "flex-start",
                              color:
                                data === value ? "#FA5300" : "text.secondary",
                              border:
                                data === value
                                  ? "1px solid #FA5300"
                                  : "1px solid #333",
                              boxShadow: "none",
                              "&:hover": {
                                background: "none",
                                boxShadow: "none",
                                borderColor: "rgba(250, 83, 0, 0.50)",
                              },
                            },
                          },
                          icon: {
                            sx: { color: data === value ? "#FA5300" : "" },
                          },
                        },
                      },
                    }}
                    onClick={() => {
                      // MUI only disables the pointer events of its own
                      // controls, so a disabled button must reject the click
                      if (readOnly || disabled) {
                        return;
                      }

                      onChange(path, value);
                      setUserChanged();
                    }}
                  />
                ) : (
                  <Radio
                    disabled={readOnly || disabled}
                    autoFocus={autoFocus(props)}
                    {...getComponentProps(props, "radio")}
                  />
                )
              }
              label={
                useButtons ? null : (
                  <HeaderView
                    schema={{
                      view: {
                        label,
                        description,
                        caption,
                        componentsProps: {
                          header: getComponentProps(props, "radioHeader"),
                        },
                      },
                    }}
                    nested
                  />
                )
              }
              sx={{
                alignItems: "center",
                pb: i === choices.length - 1 ? 0 : 0.5,
                // the label is a custom component with its own colors, so
                // MUI's disabled text color never reaches it
                "&.Mui-disabled": { opacity: 0.5 },
              }}
              {...getComponentProps(props, "radioContainer")}
            />
          ),
        )}
      </MUIRadioGroup>
    </FormControl>
  );
}

type Choice = {
  value: string;
  label: string;
  description?: string;
  caption?: string;
  icon?: string;
  disabled?: boolean;
};

export type RadioGroupProps = {
  label?: string;
  description?: string;
  choices: Array<Choice>;
  onChange: (path: string, value: string, schema: any) => void;
  schema: any; // todo
  path: string;
  data: unknown;
};
