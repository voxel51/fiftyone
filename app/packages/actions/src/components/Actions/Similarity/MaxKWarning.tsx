import { useTheme } from "@fiftyone/components";
import { ClearOutlinedIcon } from "@voxel51/voodo";
import { useActionIconSize } from "../iconSize";

type Props = {
  onClose: () => void;
  maxK: number | undefined;
  currentK: number | undefined;
};

const MaxKWarning = (props: Props) => {
  const theme = useTheme();
  const iconSize = useActionIconSize(13);

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
      <span onClick={props.onClose} style={{ display: "flex" }}>
        <ClearOutlinedIcon size={iconSize} color={theme.danger[400]} />
      </span>
    </div>
  );
};

export default MaxKWarning;
