import { useTheme } from "@fiftyone/components";
import ClearOutlinedIcon from "@mui/icons-material/ClearOutlined";
import React from "react";

type Props = {
  onClose: () => void;
  maxK: number | undefined;
  currentK: number | undefined;
};

const MaxKWarning = (props: Props) => {
  const theme = useTheme();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        border: `1px solid ${theme.divider}`,
        padding: "0.2rem",
      }}
    >
      <div style={{ color: theme.warning[400] }}>
        {props.currentK
          ? `Max K of selected model: ${props.maxK}`
          : "K cannot be empty"}
      </div>
      <ClearOutlinedIcon
        onClick={props.onClose}
        sx={{ fontSize: "small", color: theme.danger[400] }}
      />
    </div>
  );
};

export default MaxKWarning;
