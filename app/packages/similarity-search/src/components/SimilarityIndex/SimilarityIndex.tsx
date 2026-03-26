import {
  usePromptOperatorInput,
  useFirstExistingUri,
} from "@fiftyone/operators";
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
import { useMemo } from "react";
import { BrainKeyConfig } from "../../types";
import { BRAIN_COMPUTE_SIMILARITY_URI } from "../../constants";
import SimilaritySearchCTA from "../SimilaritySearchCTA";

type SimilarityIndexProps = {
  brainKeys: BrainKeyConfig[];
  onBack: () => void;
};

function AddIndexButton() {
  const promptForInput = usePromptOperatorInput();
  const { exists: hasBrainOperator } = useFirstExistingUri([
    BRAIN_COMPUTE_SIMILARITY_URI,
  ]);

  if (!hasBrainOperator) return null;

  return (
    <Button
      variant={Variant.Primary}
      size={Size.Sm}
      leadingIcon={IconName.Add}
      onClick={() => promptForInput(BRAIN_COMPUTE_SIMILARITY_URI)}
    >
      Similarity Index
    </Button>
  );
}

export default function SimilarityIndex({
  brainKeys,
  onBack,
}: SimilarityIndexProps) {
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

      {brainKeys.length === 0 ? (
        <SimilaritySearchCTA mode="onboarding" />
      ) : (
        <>
          <Stack
            orientation={Orientation.Row}
            justify={Justify.End}
            style={{ marginBottom: "1rem" }}
          >
            <AddIndexButton />
          </Stack>
          <RichList listItems={listItems} />
        </>
      )}
    </Stack>
  );
}
