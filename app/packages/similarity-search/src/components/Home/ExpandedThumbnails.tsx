import {
  Stack,
  Text,
  TextColor,
  TextVariant,
  Orientation,
  Spacing,
} from "@voxel51/voodo";
import { SimilarityRun } from "../../types";
import SampleThumbnails from "./SampleThumbnails";
import { ExpandedSection } from "../styled";

type ExpandedThumbnailsProps = {
  run: SimilarityRun;
  sampleMedia: Record<string, string>;
};

export default function ExpandedThumbnails({
  run,
  sampleMedia,
}: ExpandedThumbnailsProps) {
  const positiveIds = Array.isArray(run.query) ? run.query : [];
  const negativeIds = run.negative_query_ids ?? [];

  if (!positiveIds.length && !negativeIds.length) return null;

  return (
    <ExpandedSection>
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        {positiveIds.length > 0 && (
          <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
            <Text variant={TextVariant.Md} color={TextColor.Success}>
              Positive ({positiveIds.length})
            </Text>
            <SampleThumbnails ids={positiveIds} sampleMedia={sampleMedia} />
          </Stack>
        )}
        {negativeIds.length > 0 && (
          <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
            <Text variant={TextVariant.Md} color={TextColor.Destructive}>
              Negative ({negativeIds.length})
            </Text>
            <SampleThumbnails ids={negativeIds} sampleMedia={sampleMedia} />
          </Stack>
        )}
      </Stack>
    </ExpandedSection>
  );
}
