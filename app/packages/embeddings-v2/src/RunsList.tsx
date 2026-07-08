/**
 * The runs page: every visualization run on the dataset as a card;
 * clicking a ready card opens the plot view. Design follows the lovable
 * runs list (header count, stacked cards, upsell banner, empty state).
 * 3D runs are listed too — OSS renders them in 2D; the upsell explains
 * what Enterprise adds.
 */
import {
  EmptyState,
  IconName,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useState } from "react";
import "./panel.css";
import type { VisualizationRun } from "./protocol";
import { RunCard } from "./RunCard";
import { UpsellBanner } from "./UpsellBanner";

const formatTimestamp = (timestamp: string | null): string | null => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
};

export default function RunsList({
  runs,
  error,
  onOpen,
}: {
  runs: VisualizationRun[] | null;
  error: string | null;
  onOpen: (brainKey: string) => void;
}) {
  // Session-only dismiss; persistence is a later product call
  const [dismissed, setDismissed] = useState(false);

  if (error) {
    return (
      <div className="emb-runs-page">
        <div className="emb-runs-center">
          <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
            {error}
          </Text>
        </div>
      </div>
    );
  }

  if (!runs) {
    return (
      <div className="emb-runs-page">
        <div className="emb-runs-center">
          <Spinner size={Size.Md} />
        </div>
      </div>
    );
  }

  return (
    <div className="emb-runs-page">
      {runs.length > 0 && (
        <div className="emb-runs-header">
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            {runs.length} visualization{runs.length === 1 ? "" : "s"}
          </Text>
        </div>
      )}
      <div className="emb-runs-scroll">
        {!dismissed && <UpsellBanner onDismiss={() => setDismissed(true)} />}
        {runs.length === 0 ? (
          <div className="emb-runs-center">
            <EmptyState
              icon={IconName.Embeddings}
              title="Visualize your embeddings"
              description="Compute a visualization to explore your dataset in a low-dimensional embedding space."
            />
            <Text variant={TextVariant.Caption} color={TextColor.Muted}>
              <code>
                {'fob.compute_visualization(dataset, brain_key="viz")'}
              </code>
            </Text>
          </div>
        ) : (
          <div className="emb-runs-stack" style={{ marginTop: "1rem" }}>
            {runs.map((run) => (
              <RunCard
                key={run.brainKey}
                icon={IconName.Embeddings}
                title={run.brainKey}
                badge={run.dims ? `${run.dims}D` : undefined}
                badgeAccent={run.dims === 3}
                status={{ label: "Ready", color: TextColor.Success }}
                meta={[
                  run.method,
                  run.model,
                  formatTimestamp(run.timestamp),
                ].filter((item): item is string => Boolean(item))}
                onClick={() => onOpen(run.brainKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
