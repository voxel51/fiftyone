import { IconButton, MenuItem, Select, Tooltip } from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useKey } from "../hooks";
import { getComponentProps, getFieldSx } from "../utils";
import autoFocus from "../utils/auto-focus";
import { ViewPropsType } from "../utils/types";
import AlertView from "./AlertView";
import ChoiceMenuItemBody from "./ChoiceMenuItemBody";
import FieldWrapper from "./FieldWrapper";
import { AutocompleteView } from ".";

// if we want to support more icons in the future, add them here
const iconImports: {
  [key: string]: () => Promise<{ default: React.ComponentType<any> }>;
} = {
  MoreVertIcon: () => import("@mui/icons-material/MoreVert"),
  SettingsIcon: () => import("@mui/icons-material/Settings"),
};

const MULTI_SELECT_TYPES = ["string", "array"];

export default function DropdownView(props: ViewPropsType) {
  const { onChange, schema, path, data } = props;
  const { view = {}, type } = schema;
  const {
    choices,
    multiple: multiSelect,
    placeholder = "",
    separator = ",",
    readOnly,
    compact,
    label,
    description,
    color,
    variant,
    icon,
    addOnClickToMenuItems = false,
    tooltipTitle = "",
  } = view;
  const [IconComponent, setIconComponent] =
    useState<React.ComponentType<any> | null>(null);
  const [key, setUserChanged] = useKey(path, schema, data, true);
  const [selected, setSelected] = useState(false);

  const handleOnChange = useCallback(
    (value: any) => {
      const computedValue =
        Array.isArray(value) && type !== "array"
          ? value.join(separator)
          : value;
      onChange(path, computedValue);
      setUserChanged();
    },
    [onChange, path, separator, setUserChanged, type]
  );

  // dynamically import the icon component
  useEffect(() => {
    if (icon && iconImports[icon]) {
      iconImports[icon]().then((module) => {
        setIconComponent(() => module.default);
      });
    }
  }, [icon]);

  if (multiSelect && !MULTI_SELECT_TYPES.includes(type))
    return (
      <AlertView
        schema={{
          view: {
            label: `Unsupported type "${type}" for multi-select`,
            description:
              "Multi-select is supported for types " +
              MULTI_SELECT_TYPES.join(", "),
            severity: "error",
          },
        }}
      />
    );

  const isArrayType = type === "array";
  const multiple = multiSelect || isArrayType;
  const fallbackDefaultValue = multiple ? [] : "";
  const rawDefaultValue = data ?? fallbackDefaultValue;
  const computedDefaultValue =
    multiple && !Array.isArray(rawDefaultValue)
      ? rawDefaultValue.toString().split(separator)
      : rawDefaultValue;

  const choiceLabels = useMemo(() => {
    return choices.reduce((labels, choice) => {
      labels[choice.value] = choice.label;
      return labels;
    }, {});
  }, [choices]);

  const getIconOnlyStyles = () => ({
    "&.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-colorPrimary": {
      backgroundColor: "transparent !important",
      borderRadius: "0 !important",
      border: "none !important",
      boxShadow: "none !important",
      "&:hover, &:focus": {
        backgroundColor: "transparent !important",
        boxShadow: "none !important",
      },
    },
    "& .MuiSelect-select": {
      padding: 0,
      background: "transparent",
      "&:focus": {
        background: "transparent",
      },
    },
    "& .MuiInputBase-root": {
      background: "transparent",
    },
    "& .MuiOutlinedInput-notchedOutline": {
      border: "none",
    },
    "& .MuiSelect-icon": {
      display: "none",
    },
  });

  const getDefaultStyles = (selected: boolean) => ({
    ".MuiSelect-select": {
      padding: "0.45rem 2rem 0.45rem 1rem",
      opacity: selected ? 1 : 0.5,
    },
  });

  const getDropdownStyles = (icon: string | undefined, selected: boolean) => {
    return icon ? getIconOnlyStyles() : getDefaultStyles(selected);
  };

  // Now, condense the code like this:
  const { MenuProps = {}, ...selectProps } = getComponentProps(
    props,
    "select",
    {
      sx: {
        ...getDropdownStyles(icon, selected),
        ...getFieldSx({ color, variant }),
      },
    }
  );

  const renderIcon = () => {
    if (!IconComponent) return null;

    return (
      <IconButton aria-label={icon}>
        <IconComponent />
      </IconButton>
    );
  };

  if (multiple) {
    return (
      <AutocompleteView
        {...props}
        schema={{
          ...schema,
          view: {
            value_only: true,
            allow_user_input: false,
            allow_duplicates: false,
            ...view,
          },
        }}
      />
    );
  }

  return (
    <FieldWrapper {...props} hideHeader={compact}>
      <Tooltip title={tooltipTitle}>
        <Select
          key={key}
          disabled={readOnly}
          autoFocus={autoFocus(props)}
          defaultValue={computedDefaultValue}
          size="small"
          fullWidth={!icon}
          displayEmpty
          title={compact ? description : undefined}
          renderValue={(value) => {
            if (icon) {
              return renderIcon();
            }
            const unselected = value?.length === 0;
            setSelected(!unselected);
            if (unselected) {
              if (compact) {
                return placeholder || label;
              }
              return placeholder;
            }
            if (multiple) {
              return value.map((item) => choiceLabels[item] || item).join(", ");
            }
            return choiceLabels[value] || value;
          }}
          onChange={(e) => {
            const value = e.target.value;
            handleOnChange(value);
          }}
          multiple={multiple}
          {...selectProps}
          MenuProps={{
            ...MenuProps,
            sx: {
              zIndex: (theme) => theme.zIndex.operatorPalette + 1,
              ...(MenuProps?.sx || {}),
            },
          }}
        >
          {choices.map(({ value, ...choice }) => (
            <MenuItem
              disabled={readOnly}
              key={value}
              value={value}
              onClick={() => {
                if (addOnClickToMenuItems) {
                  handleOnChange(value);
                }
              }}
              {...getComponentProps(props, "optionContainer")}
            >
              <ChoiceMenuItemBody {...choice} {...props} />
            </MenuItem>
          ))}
        </Select>
      </Tooltip>
    </FieldWrapper>
  );
}
