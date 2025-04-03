import { Table, styled } from "@mui/material";

const CUSTOM_PROPS = ["variant"];

const EvaluationTable = styled(Table, {
  shouldForwardProp: (prop) => {
    return !CUSTOM_PROPS.includes(prop as string);
  },
})<{ variant?: string }>(({ theme, variant }) => {
  if (variant === "card") {
    return {
      borderCollapse: "separate",
      borderSpacing: "0 8px",
      "& .MuiTableCell-root": {
        border: "none",
      },
      "& .MuiTableCell-head": {
        color: theme.palette.text.secondary,
      },
      "& .MuiTableRow-root:not(.MuiTableRow-head)": {
        "& .MuiTableCell-root": {
          background: theme.palette.background.level1,
          "&:first-of-type": {
            borderTopLeftRadius: theme.shape.borderRadius,
            borderBottomLeftRadius: theme.shape.borderRadius,
          },
          "&:last-of-type": {
            borderTopRightRadius: theme.shape.borderRadius,
            borderBottomRightRadius: theme.shape.borderRadius,
          },
        },
      },
    };
  }

  return {
    ".MuiTableCell-root": {
      border: `1px solid ${theme.palette.divider}`,
    },
  };
});

EvaluationTable.defaultProps = {
  size: "small",
};

export default EvaluationTable;
