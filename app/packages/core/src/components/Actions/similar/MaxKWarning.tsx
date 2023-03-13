import React from "react";
import { useTheme } from "@fiftyone/components";
import ClearOutlinedIcon from "@mui/icons-material/ClearOutlined";

type Props = {
  onClose: () => void;
  maxK: number;
};

const MaxKWarning: React.FunctionComponent<Props> = (props) => {
  const theme = useTheme();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        border: "1px solid " + theme.divider,
        padding: "0.2rem",
      }}
    >
      <div style={{ color: theme.warning[400] }}>
        Max K of selected model: {props.maxK}
      </div>
      <ClearOutlinedIcon
        onClick={props.onClose}
        sx={{ fontSize: "small", color: theme.danger[400] }}
      />
    </div>
  );
};

export default MaxKWarning;
