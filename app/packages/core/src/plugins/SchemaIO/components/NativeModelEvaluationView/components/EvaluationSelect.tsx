import { Select, styled } from "@mui/material";

const CUSTOM_PROPS = ["ghost"];

const EvaluationSelect = styled(Select, {
  shouldForwardProp: (prop) => {
    return !CUSTOM_PROPS.includes(prop as string);
  },
})<{ ghost?: boolean }>(({ ghost }) => {
  if (ghost) {
    return {
      cursor: "pointer",
      ".MuiSelect-select": {
        background: "none",
        padding: "4px 32px 4px 4px",
        cursor: "pointer",
      },
      fieldset: {
        border: "none",
      },
      ".MuiSelect-icon": {
        pointerEvents: "none",
        right: "8px",
      },
      "&:hover .MuiSelect-icon": {
        color: "inherit",
      },
    };
  }

  return {};
});

EvaluationSelect.defaultProps = {
  size: "small",
  sx: {
    color: (theme) => theme.palette.text.secondary,
  },
};

export default EvaluationSelect;
