import { Size, Text, TextColor, TextVariant, Toggle } from "@voxel51/voodo";
import { useClipToFrame } from "./useLabelSchema";

const ClipToFrameSection = ({ field }: { field: string }) => {
  const { canClipToFrame, clipToFrame, toggleClipToFrame } =
    useClipToFrame(field);

  if (!canClipToFrame) {
    return null;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.25rem",
        }}
      >
        <Text variant={TextVariant.Lg}>Clip labels to frame</Text>
        <Toggle
          data-cy="clip-to-frame-toggle"
          size={Size.Md}
          checked={clipToFrame}
          onChange={toggleClipToFrame}
        />
      </div>
      <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
        When enabled, labels drawn past the frame's edges are clipped to it.
      </Text>
    </div>
  );
};

export default ClipToFrameSection;
