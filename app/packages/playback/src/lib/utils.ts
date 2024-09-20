import { getTimelineNameFromSampleAndGroupId } from "./use-default-timeline-name";

export const getTimelineSetFrameNumberEventName = (timelineName: string) =>
  `set-frame-number-${timelineName}`;

export const dispatchTimelineSetFrameNumberEvent = ({
  timelineName: mayBeTimelineName,
  newFrameNumber,
}: {
  timelineName?: string;
  newFrameNumber: number;
}) => {
  let timelineName = "";

  if (!mayBeTimelineName) {
    // get it from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sampleId = urlParams.get("id");
    const groupId = urlParams.get("groupId");

    if (!sampleId && !groupId) {
      throw new Error(
        "No timeline name provided and no 'id' or 'groupId' query param in URL"
      );
    }
    timelineName = getTimelineNameFromSampleAndGroupId(sampleId, groupId);
  } else {
    timelineName = mayBeTimelineName;
  }

  document.getElementById("modal")!.dispatchEvent(
    new CustomEvent(getTimelineSetFrameNumberEventName(timelineName), {
      detail: { frameNumber: Math.max(newFrameNumber, 1) },
    })
  );
};
