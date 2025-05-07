import { Select, styled } from "@mui/material";

const CUSTOM_PROPS = ["ghost"];

const EvaluationSelect = styled(Select, {
  shouldForwardProp: (prop) => {
    return !CUSTOM_PROPS.includes(prop as string);
  },
})<{ ghost?: boolean }>(({ ghost }) => {
  if (ghost) {
    return {
      ".MuiSelect-select": {
        background: "none",
        padding: "4px 32px 4px 4px",
      },
      fieldset: {
        border: "none",
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
