import { PanelCTA, PanelCTAProps } from "@fiftyone/components";
import { Button, Size, Variant } from "@voxel51/voodo";
import useComputeSimilarity from "../hooks/useComputeSimilarity";

function Actions() {
  const computeSim = useComputeSimilarity();
  if (!computeSim.isAvailable) return null;
  return (
    <Button
      variant={Variant.Primary}
      size={Size.Sm}
      onClick={() => computeSim.prompt()}
    >
      Compute Similarity Index
    </Button>
  );
}

export default function SimilaritySearchCTA(props: SimilaritySearchCTAProps) {
  const { mode, onBack } = props;
  return (
    <PanelCTA
      label="Similarity indexes help you search your data by visual and text similarity"
      demoLabel="Upgrade to FiftyOne Enterprise to Search by Visual and Text Similarity"
      description="You can create similarity indexes for your dataset using a selection of pre-trained models or your own embeddings"
      docLink="https://docs.voxel51.com/brain.html#similarity"
      docCaption="Learn how to create similarity indexes via code."
      demoDocCaption="Not ready to upgrade yet? Learn how to create similarity indexes via code"
      icon="image_search"
      Actions={Actions}
      name="Similarity Search"
      onBack={onBack}
      mode={mode}
    />
  );
}

type SimilaritySearchCTAProps = {
  onBack?: PanelCTAProps["onBack"];
  mode?: PanelCTAProps["mode"];
};
