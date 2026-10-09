import { QuestionMarkIcon } from "@voxel51/voodo";
import { Tooltip } from "@fiftyone/components";
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
        placement="top-center"
        text={`Count query timed out at ${queryTime} second${
          queryTime > 1 ? "s" : ""
        }`}
      >
        <QuestionMarkIcon
          size={14}
          color={theme.text.secondary}
          style={{ marginRight: 2 }}
        />
      </Tooltip>
    </div>
  );
};

export default TimedOut;
