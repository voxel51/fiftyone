import { Icon, IconProps } from "@mui/material";
import "material-icons/iconfont/material-icons.css";
import React from "react";

// Available Icons: https://github.com/marella/material-icons?tab=readme-ov-file#available-icons
export default function MuiIconFont(props: MuiIconFontProps) {
  const { name, ...iconProps } = props;
  return <Icon {...iconProps}>{name}</Icon>;
}

type MuiIconFontProps = IconProps & {
  name: string;
};
