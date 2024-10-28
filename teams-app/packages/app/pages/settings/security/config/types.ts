import { BoxProps } from "@mui/material";

export type SettingComponentProps = {
  onChange: (value: unknown) => void;
  value: unknown;
  updating?: boolean;
};

export type Setting = {
  id: string;
  label: string;
  Component: React.ComponentType<SettingComponentProps>;
  updating?: boolean;
  value: unknown;
  caption?: string;
};

export type SettingsGroupProps = Omit<BoxProps, "onChange"> & {
  title: string;
  description?: string;
  settings: Array<Setting>;
  onChange: (id: string, value: unknown) => void;
};
