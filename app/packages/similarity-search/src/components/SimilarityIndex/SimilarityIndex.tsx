import { PendingRunCard, RunScreen } from "@fiftyone/components";
import {
  usePendingRunScreen,
  type PendingRunWithView,
} from "@fiftyone/operators";
import { constants } from "@fiftyone/utilities";
import {
  Align,
  Button,
  Icon,
  IconColor,
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
import { AnnotatedBrainKeyConfig } from "../../types";
import SimilaritySearchCTA from "../SimilaritySearchCTA";

type SimilarityIndexProps = {
  brainKeys: AnnotatedBrainKeyConfig[];
  pendingRuns: PendingRunWithView[];
  onBack: () => void;
};

export default function SimilarityIndex({
  brainKeys,
  pendingRuns,
  onBack,
}: SimilarityIndexProps) {
  const [showCTA, setShowCTA] = useState(false);

  const { open: openPending, screen: pendingScreen } = usePendingRunScreen(
    pendingRuns,
    "Your similarity index is being built. You can leave this panel; the index will be listed here when it finishes.",
  );

  const onAddIndex = useCallback(() => {
    if (constants.IS_APP_MODE_FIFTYONE) {
      setShowCTA(true);
    } else {
      // TODO: trigger event compute similarity operator on teams
    }
  }, []);
  const listItems = useMemo(
    () =>
      brainKeys.map((bk) => {
        const details = (
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
            {bk.metric && (
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                Metric: {bk.metric}
              </Text>
            )}
            {bk.identifiers?.map((id) => (
              <Text
                key={id.label}
                variant={TextVariant.Md}
                color={TextColor.Secondary}
              >
                {id.label}: {id.value}
              </Text>
            ))}
            <Stack
              orientation={Orientation.Row}
              spacing={Spacing.Xs}
              align={Align.Center}
            >
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                Supports text queries?
              </Text>
              <Icon
                name={bk.supports_prompts ? IconName.Check : IconName.Close}
                size={Size.Sm}
                color={
                  bk.supports_prompts ? IconColor.Success : IconColor.Failure
                }
              />
            </Stack>
            {bk.embeddings_field && (
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                Embeddings field: {bk.embeddings_field}
              </Text>
            )}
            {bk.patches_field && (
              <Text variant={TextVariant.Md} color={TextColor.Muted}>
                Patches field: {bk.patches_field}
              </Text>
            )}
          </Stack>
        );
        return {
          id: bk.key,
          data: {
            // Indexes that can't be used in the current view are shown
            // grayed out with an explanatory tooltip
            style: bk.compatible ? undefined : { opacity: 0.5 },
            primaryContent: bk.compatible ? (
              details
            ) : (
              <Tooltip content={bk.incompatibleReason}>
                <div>{details}</div>
              </Tooltip>
            ),
          },
        };
      }),
    [brainKeys],
  );

  if (pendingScreen) return <RunScreen {...pendingScreen} />;

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

      {(brainKeys.length === 0 && pendingRuns.length === 0) || showCTA ? (
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
          <Stack
            orientation={Orientation.Column}
            spacing={Spacing.Sm}
            style={{ marginBottom: "0.5rem" }}
          >
            {pendingRuns.map((pending) => (
              <PendingRunCard
                key={pending.id}
                title={pending.brain_key ?? pending.label ?? pending.operator}
                icon={null}
                runState={pending.run_state}
                onOpen={() => openPending(pending.id)}
                onViewRun={pending.onView}
              />
            ))}
          </Stack>
          <RichList listItems={listItems} />
        </>
      )}
    </Stack>
  );
}
