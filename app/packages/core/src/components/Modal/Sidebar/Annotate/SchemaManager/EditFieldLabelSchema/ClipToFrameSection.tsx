import { Size, Text, TextColor, TextVariant, Toggle } from "@voxel51/voodo";
import { useClipToFrame } from "./useLabelSchema";

const ClipToFrameSection = ({ field }: { field: string }) => {
  const { canClipToFrame, clipToFrame, toggleClipToFrame } =
    useClipToFrame(field);

  if (!canClipToFrame) {
    return null;
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
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
        When enabled, spatial labels drawn outside of the boundaries of an image
        or video frame will be clipped down to the frame boundaries.
      </Text>
    </div>
  );
};

export default ClipToFrameSection;
