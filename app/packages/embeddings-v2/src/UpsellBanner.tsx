/**
 * The OSS upsell for Enterprise 3D exploration, shown at the top of the
 * runs page. The aside is a decorative spinning point cloud — see
 * TeaserCloud for why that isn't "shipping a 3D renderer".
 */
import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import "./panel.css";
import { Callout } from "./Callout";
import { TeaserCloud } from "./TeaserCloud";

const LEARN_MORE_URL = "https://voxel51.com/enterprise";

export function UpsellBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Callout
      icon={IconName.Embeddings}
      title="Explore clusters in three dimensions"
      description="Rotate, zoom, and explore clusters in 3D — available in FiftyOne Enterprise."
      aside={<TeaserCloud />}
      actions={
        <>
          <Button
            variant={Variant.Primary}
            size={Size.Sm}
            trailingIcon={IconName.ExternalLink}
            onClick={() => window.open(LEARN_MORE_URL, "_blank", "noopener")}
          >
            Learn more
          </Button>
          <Button
            variant={Variant.Secondary}
            size={Size.Sm}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </>
      }
    />
  );
}
