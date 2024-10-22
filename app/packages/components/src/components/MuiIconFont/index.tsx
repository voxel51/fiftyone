import { Icon, IconProps } from "@mui/material";
import "material-icons/iconfont/material-icons.css";
import React from "react";

type MuiIconFontProps = IconProps & {
  name: string;
  variant?: "filled" | "outlined" | "rounded" | "sharp";
};

const defaultProps = { variant: "filled" as const };

// Available Icons: https://github.com/marella/material-icons?tab=readme-ov-file#available-icons
const MuiIconFont = React.memo(function MuiIconFont(props: MuiIconFontProps) {
  const { name, variant = defaultProps.variant, ...iconProps } = props;

  const variantClassMap = {
    filled: "",
    outlined: "material-icons-outlined",
    rounded: "material-icons-rounded",
    sharp: "material-icons-sharp",
  };

  const className = variant ? variantClassMap[variant] : "";

  return (
    <Icon {...iconProps} className={className || undefined}>
      {name}
    </Icon>
  );
});
export default MuiIconFont;
