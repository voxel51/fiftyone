import { PopoutSectionTitle, TabOption } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useRecoilState, useRecoilValue } from "recoil";

const FIT_OPTIONS = ["cover", "contain"] as const;

/** Cover/Contain control shown only for multimodal grid datasets. */
export default function MultimodalGridFitSetting() {
  const isMultimodal = useRecoilValue(fos.isMultimodalDataset);
  return isMultimodal ? <FitSetting /> : null;
}

function FitSetting() {
  const [fit, setFit] = useRecoilState(fos.multimodalGridFit);
  return (
    <>
      <PopoutSectionTitle>Multimodal media fit</PopoutSectionTitle>
      <TabOption
        active={fit}
        options={FIT_OPTIONS.map((value) => ({
          dataCy: `multimodal-grid-fit-${value}`,
          onClick: () => setFit(value),
          text: value,
          title:
            value === "cover"
              ? "Fill square grid tiles; content may be cropped"
              : "Show the full frame with letterboxing",
        }))}
      />
    </>
  );
}
