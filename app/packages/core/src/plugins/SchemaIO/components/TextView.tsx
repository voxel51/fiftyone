import { Box, Typography, type TypographyProps } from "@mui/material";
import { getComponentProps } from "../utils";
import { NumberSchemaType, ViewPropsType } from "../utils/types";

type TextViewOptions = {
  color?: string;
  font_size?: string;
  title?: string;
  text_transform?: TypographyProps["textTransform"];
  variant?: TypographyProps["variant"];
  bold?: boolean;
  italic?: boolean;
  align?: TypographyProps["align"];
  no_wrap?: boolean;
  text_decoration?: string;
  letter_spacing?: string;
  line_height?: string;
  font_family?: string;
  width?: string | number;
  display_mode?: string;
  padding?: string | number;
};

export default function TextView(props: ViewPropsType<NumberSchemaType>) {
  const { schema } = props;
  const { view = {} } = schema;
  const {
    color = "primary",
    font_size = "1rem",
    title = "",
    text_transform = "none",
    variant = "body1",
    bold = false,
    italic = false,
    align = "inherit",
    no_wrap = false,
    text_decoration = "none",
    letter_spacing = "normal",
    line_height = "normal",
    font_family = "default",
    width = "auto",
    display_mode = "block",
    padding = "1rem",
  } = view as TextViewOptions;

  const sx = {
    font_family,
    ...(bold ? { fontWeight: "bold" } : {}),
    ...(italic ? { fontStyle: "italic" } : {}),
    ...(no_wrap
      ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : {}),
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <Typography
        padding={padding}
        display={display_mode}
        width={width}
        variant={variant}
        color={color}
        fontSize={font_size}
        textTransform={text_transform}
        align={align}
        letterSpacing={letter_spacing}
        noWrap={no_wrap}
        lineHeight={line_height}
        textDecoration={text_decoration}
        sx={sx}
        {...getComponentProps(props, "text")}
      >
        {title}
      </Typography>
    </Box>
  );
}
