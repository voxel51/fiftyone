import { PanelCTA, PanelCTAProps } from "@fiftyone/components";
import ComputeVisualizationButton from "./ComputeVisualizationButton";
import useComputeVisualization from "./useComputeVisualization";

export function Actions(props: ActionsProps) {
  const computeViz = useComputeVisualization();
  const defaultHandler = () => computeViz.prompt();
  const { handler = defaultHandler } = props;
  return <ComputeVisualizationButton onClick={handler} />;
}

export default function EmbeddingsCTA(props: EmbeddingsCTAProps) {
  const { mode, onBack } = props;
  return (
    <PanelCTA
      label="Embeddings help you explore and understand your dataset"
      demoLabel="Upgrade to FiftyOne Teams to Create Embeddings"
      description="You can compute and visualize embeddings for your dataset using a selection of pre-trained models or your own embeddings"
      docLink="https://docs.voxel51.com/user_guide/app.html#embeddings-panel"
      docCaption="Not ready to upgrade yet? Learn how to create embeddings visualizations via code."
      icon="workspaces"
      Actions={Actions}
      name="Embeddings"
      onBack={onBack}
      mode={mode}
    />
  );
}

type EmbeddingsCTAProps = {
  onBack: PanelCTAProps["onBack"];
  mode?: PanelCTAProps["mode"];
};

type ActionsProps = {
  handler?: () => void;
};
