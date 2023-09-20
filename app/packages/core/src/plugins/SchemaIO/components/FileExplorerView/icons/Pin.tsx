import { useTheme } from "@mui/material";
import SvgIcon, { SvgIconProps } from "@mui/material/SvgIcon";

type PinOutlinedProps = SvgIconProps & {
  variant?: "contained" | "outlined";
};

export default function PinIcon({
  variant = "contained",
  ...props
}: PinOutlinedProps) {
  const theme = useTheme();

  return (
    <SvgIcon
      {...props}
      viewBox="0 0 14 20"
      sx={{
        fontSize: 16,
        fill: variant === "outlined" ? "none" : theme.palette.text.secondary,
      }}
    >
      <path
        d="M6.99984 13H1.1665C1.1665 13 1.1665 11.3334 1.99984 10.5C2.83317 9.66671 3.6665 9.66671 3.6665 9.66671V3.83337H3.24984C3.24984 3.83337 1.99984 3.83337 1.99984 2.58337C1.99984 1.33337 3.24984 1.33337 3.24984 1.33337H6.99984H10.7498C10.7498 1.33337 11.9998 1.33337 11.9998 2.58337C11.9998 3.83337 10.7498 3.83337 10.7498 3.83337H10.3332V9.66671C10.3332 9.66671 11.1665 9.66671 11.9998 10.5C12.8332 11.3334 12.8332 13 12.8332 13H6.99984ZM6.99984 13V17.1667"
        stroke={theme.palette.text.secondary}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </SvgIcon>
  );
}
