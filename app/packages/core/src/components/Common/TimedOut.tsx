import { QuestionMark } from "@mui/icons-material";
import { Anchor, Tooltip } from "@voxel51/voodo";
import { useTheme } from "styled-components";

const TimedOut = ({ queryTime }: { queryTime: number }) => {
  const theme = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Tooltip
        anchor={Anchor.Top}
        content={`Count query timed out at ${queryTime} second${
          queryTime > 1 ? "s" : ""
        }`}
        style={{ display: "flex" }}
      >
        <QuestionMark
          style={{
            marginRight: 2,
            color: theme.text.secondary,
            height: 14,
            width: 14,
          }}
        />
      </Tooltip>
    </div>
  );
};

export default TimedOut;
