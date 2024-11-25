import { Typography, TypographyProps } from "@mui/material";

export default function StringElementNullish(props: TypographyProps) {
  const { children, ...otherProps } = props;
  if (children === null || children === undefined) return null;
  if (typeof children === "string")
    return <Typography {...otherProps}>{children}</Typography>;
  return children as JSX.Element;
}
