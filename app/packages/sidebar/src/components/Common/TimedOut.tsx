import { QuestionMarkIcon, TextColor, Tooltip } from "@voxel51/voodo";

const TimedOut = ({ queryTime }: { queryTime: number }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Tooltip
        wrapperClassName="flex"
        content={`Count query timed out at ${queryTime} second${
          queryTime > 1 ? "s" : ""
        }`}
      >
        <QuestionMarkIcon
          size={14}
          color={TextColor.Secondary}
          style={{ marginRight: 2 }}
        />
      </Tooltip>
    </div>
  );
};

export default TimedOut;
