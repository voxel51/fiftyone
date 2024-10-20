import { Icon, IconProps } from "@mui/material";
import "material-icons/iconfont/material-icons.css";
import React from "react";

// Available Icons: https://github.com/marella/material-icons?tab=readme-ov-file#available-icons
export default function MuiIconFont(props: MuiIconFontProps) {
  const { name, variant, ...iconProps } = props;

  let icon = <Icon {...iconProps}>{name}</Icon>;

  if (variant === "outlined") {
    icon = (
      <Icon {...iconProps} className="material-icons-outlined">
        {name}
      </Icon>
    );
  } else if (variant === "rounded") {
    icon = (
      <Icon {...iconProps} className="material-icons-rounded">
        {name}
      </Icon>
    );
  } else if (variant === "sharp") {
    icon = (
      <Icon {...iconProps} className="material-icons-sharp">
        {name}
      </Icon>
    );
  }

  return icon;
}

type MuiIconFontProps = IconProps & {
  name: string;
  variant?: "filled" | "outlined" | "rounded" | "sharp";
};
