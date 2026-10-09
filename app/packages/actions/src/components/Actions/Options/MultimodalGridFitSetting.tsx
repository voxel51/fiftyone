import * as fos from "@fiftyone/state";
import { useReverbState, useReverbValue } from "@fiftyone/reverb";
import { PanelSection, PanelTabs } from "../Panel";

const FIT_OPTIONS = ["cover", "contain"] as const;

/** Cover/Contain control shown only for multimodal grid datasets. */
export default function MultimodalGridFitSetting() {
  const isMultimodal = useReverbValue(fos.isMultimodalDataset);
  return isMultimodal ? <FitSetting /> : null;
}

function FitSetting() {
  const [fit, setFit] = useReverbState(fos.multimodalGridFit);
  return (
    <PanelSection title="Multimodal media fit">
      <PanelTabs
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
    </PanelSection>
  );
}
