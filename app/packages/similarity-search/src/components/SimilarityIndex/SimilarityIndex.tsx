import { AddIcon as Add, ArrowBackIcon as ArrowBack } from "../../mui";
import {
  usePromptOperatorInput,
  useFirstExistingUri,
} from "@fiftyone/operators";
import {
  Button,
  Heading,
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
import React, { useMemo } from "react";
import { BrainKeyConfig } from "../../types";
import { BRAIN_COMPUTE_SIMILARITY_URI } from "../../constants";
import NoBrainKeysEmptyState from "../Home/NoBrainKeysEmptyState";
import * as s from "../styles";

type SimilarityIndexProps = {
  brainKeys: BrainKeyConfig[];
  onBack: () => void;
};

const BackIcon = () => <ArrowBack fontSize="small" />;
const AddIcon = () => <Add fontSize="small" />;

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
      leadingIcon={AddIcon}
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
    <div style={s.runListContainer}>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center", marginBottom: "1rem" }}
      >
        <Tooltip content="Back to similarity searches">
          <Button
            aria-label="Back to similarity searches"
            size={Size.Sm}
            variant={Variant.Borderless}
            leadingIcon={BackIcon}
            onClick={onBack}
          />
        </Tooltip>
        <Text variant={TextVariant.Md} color={TextColor.Secondary}>
          Back to similarity searches
        </Text>
      </Stack>

      {brainKeys.length === 0 ? (
        <NoBrainKeysEmptyState />
      ) : (
        <>
          <Stack
            orientation={Orientation.Row}
            style={{
              justifyContent: "flex-end",
              marginBottom: "1rem",
            }}
          >
            <AddIndexButton />
          </Stack>
          <RichList listItems={listItems} />
        </>
      )}
    </div>
  );
}
