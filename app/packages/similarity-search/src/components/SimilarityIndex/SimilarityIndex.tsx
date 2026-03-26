import { constants } from "@fiftyone/utilities";
import {
  Align,
  Button,
  IconName,
  Justify,
  RichList,
  Size,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Orientation,
  Spacing,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useMemo, useState } from "react";
import { BrainKeyConfig } from "../../types";
import SimilaritySearchCTA from "../SimilaritySearchCTA";

type SimilarityIndexProps = {
  brainKeys: BrainKeyConfig[];
  onBack: () => void;
};

export default function SimilarityIndex({
  brainKeys,
  onBack,
}: SimilarityIndexProps) {
  const [showCTA, setShowCTA] = useState(false);

  const onAddIndex = useCallback(() => {
    if (constants.IS_APP_MODE_FIFTYONE) {
      setShowCTA(true);
    } else {
      // TODO: trigger event compute similarity operator on teams
    }
  }, []);
  const listItems = useMemo(
    () =>
      brainKeys.map((bk) => ({
        id: bk.key,
        data: {
          primaryContent: (
            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              <span style={{ fontWeight: "bold" }}>{bk.key}</span>
              {bk.model && (
                <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                  Model: {bk.model}
                </Text>
              )}
              {bk.backend && (
                <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                  Backend: {bk.backend}
                </Text>
              )}
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                Supports text queries?{" "}
                {bk.supports_prompts ? "\u2705" : "\u274C"}
              </Text>
              {bk.patches_field && (
                <Text variant={TextVariant.Md} color={TextColor.Muted}>
                  Patches field: {bk.patches_field}
                </Text>
              )}
            </Stack>
          ),
        },
      })),
    [brainKeys]
  );

  return (
    <Stack
      orientation={Orientation.Column}
      style={{ padding: 16, height: "100%" }}
    >
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        align={Align.Center}
        style={{ marginBottom: "1rem" }}
      >
        <Tooltip content="Back to similarity searches">
          <Button
            aria-label="Back to similarity searches"
            size={Size.Md}
            variant={Variant.Borderless}
            leadingIcon={IconName.ArrowLeft}
            onClick={onBack}
          />
        </Tooltip>
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          Back to similarity searches
        </Text>
      </Stack>

      {brainKeys.length === 0 || showCTA ? (
        <SimilaritySearchCTA
          mode="onboarding"
          onBack={showCTA ? () => setShowCTA(false) : undefined}
        />
      ) : (
        <>
          <Stack
            orientation={Orientation.Row}
            justify={Justify.End}
            style={{ marginBottom: "1rem" }}
          >
            <Button
              variant={Variant.Primary}
              size={Size.Sm}
              leadingIcon={IconName.Add}
              onClick={onAddIndex}
            >
              Similarity Index
            </Button>
          </Stack>
          <RichList listItems={listItems} />
        </>
      )}
    </Stack>
  );
}
