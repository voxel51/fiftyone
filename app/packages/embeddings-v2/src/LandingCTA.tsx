/**
 * The no-runs landing for builds that cannot compute in-app: the
 * enterprise upsell page the legacy panel showed, which the rewrite
 * had replaced with a neutral empty state (FOEPD-4369 asked for it
 * back). PanelCTA renders the demo variant (Book a demo / Try in
 * browser) under the OSS app mode and a plain variant elsewhere;
 * Teams builds never render this at all (showUpsell is false there).
 * Strings mirror the legacy panel's EmbeddingsCTA, which owns them
 * until that package is deleted.
 */
import { PanelCTA } from "@fiftyone/components";

const TRY_LINK = "http://voxel51.com/try-embeddings";

export function LandingCTA() {
  return (
    <PanelCTA
      label="Embeddings help you explore and understand your dataset"
      demoLabel="Upgrade to FiftyOne Enterprise to Create Embeddings"
      description="You can compute and visualize embeddings for your dataset using a selection of pre-trained models or your own embeddings"
      docLink="https://docs.voxel51.com/user_guide/app.html#embeddings-panel"
      docCaption="Learn how to create embeddings visualizations via code."
      demoDocCaption="Not ready to upgrade yet? Learn how to create embeddings visualizations via code."
      icon="workspaces"
      name="Embeddings"
      mode="onboarding"
      // Onboarding mode renders no back affordance; the prop is only
      // required by the shared component's type
      onBack={() => undefined}
      tryLink={TRY_LINK}
    />
  );
}
