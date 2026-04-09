import {
  Align,
  Button,
  FormField,
  Heading,
  HeadingLevel,
  IconName,
  Input,
  InputType,
  Justify,
  RadioGroup,
  Select,
  Size,
  Stack,
  Text,
  TextArea,
  TextColor,
  TextVariant,
  Toggle,
  Orientation,
  Spacing,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { OperatorExecutionButton } from "@fiftyone/operators";
import { BrainKeyConfig, CloneConfig, SearchScope } from "../../types";
import {
  SEARCH_OPERATOR_URI,
  CHECK_MARK,
  CROSS_MARK,
  QUERY_IMAGE,
  QUERY_TEXT,
} from "../../constants";
import { useNewSearchForm } from "../../hooks/useNewSearchForm";
import {
  NewSearchContainer,
  InfoCard,
  QuerySelectorBoxActive,
  QuerySelectorBoxInactive,
} from "../styled";

type NewSearchProps = {
  brainKeys: BrainKeyConfig[];
  cloneConfig?: CloneConfig | null;
  isPatchesView?: boolean;
  onBack: () => void;
  onSubmitted: () => void;
};

export default function NewSearch({
  brainKeys,
  cloneConfig,
  isPatchesView = false,
  onBack,
  onSubmitted,
}: NewSearchProps) {
  const form = useNewSearchForm(brainKeys, cloneConfig, onSubmitted);

  return (
    <NewSearchContainer>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        align={Align.Center}
        style={{ marginBottom: "1.5rem" }}
      >
        <Button
          size={Size.Md}
          variant={Variant.Borderless}
          leadingIcon={IconName.ArrowLeft}
          onClick={onBack}
        />
        <Heading level={HeadingLevel.H2}>
          {cloneConfig ? "Clone Search" : "New Search"}
        </Heading>
      </Stack>

      <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
        {/* Similarity index selector */}
        <FormField
          label="Similarity Index"
          control={
            <Select
              exclusive
              options={form.brainKeyOptions}
              value={form.brainKey}
              onChange={(value) => form.setBrainKey((value as string) ?? "")}
            />
          }
        />

        {/* Index info card */}
        {form.selectedConfig && (
          <InfoCard>
            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              {form.selectedConfig.model && (
                <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                  Model: {form.selectedConfig.model}
                </Text>
              )}
              {form.selectedConfig.backend && (
                <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                  Backend: {form.selectedConfig.backend}
                </Text>
              )}
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                Supports text queries?{" "}
                {form.selectedConfig.supports_prompts ? CHECK_MARK : CROSS_MARK}
              </Text>
            </Stack>
          </InfoCard>
        )}

        {brainKeys.length === 0 && (
          <InfoCard>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              No similarity indexes found. Compute a similarity index on your
              dataset first.
            </Text>
          </InfoCard>
        )}

        {/* Search scope */}
        <FormField
          label="Search scope"
          control={
            <RadioGroup
              options={
                isPatchesView
                  ? [
                      { value: "dataset", label: "All Patches" },
                      { value: "view", label: "Current Patches View" },
                    ]
                  : [
                      { value: "dataset", label: "Full Dataset" },
                      { value: "view", label: "Current View" },
                    ]
              }
              value={form.searchScope}
              onChange={(value) => form.setSearchScope(value as SearchScope)}
              size={Size.Sm}
              style={{ display: "flex", flexDirection: "row", gap: "1rem" }}
            />
          }
        />

        {/* Query type toggle */}
        {form.supportsPrompts && (
          <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
            <Button
              variant={
                form.queryType === QUERY_IMAGE
                  ? Variant.Primary
                  : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => form.setQueryType(QUERY_IMAGE)}
              style={{ flex: 1 }}
            >
              Image Search
            </Button>
            <Button
              variant={
                form.queryType === QUERY_TEXT
                  ? Variant.Primary
                  : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => form.setQueryType(QUERY_TEXT)}
              style={{ flex: 1 }}
            >
              Text Search
            </Button>
          </Stack>
        )}

        {/* Query input */}
        {form.queryType === QUERY_TEXT ? (
          <FormField
            label="Text query"
            control={
              <TextArea
                placeholder="Enter a text prompt..."
                value={form.textQuery}
                onChange={(e) => form.setTextQuery(e.target.value)}
                rows={3}
                size={Size.Sm}
              />
            }
          />
        ) : form.queryIds.length > 0 ? (
          <QuerySelectorBoxActive>
            <Text variant={TextVariant.Sm} color={TextColor.Primary}>
              {`${form.queryIds.length} ${
                Array.isArray(form.selectedLabels) &&
                form.selectedLabels.length > 0
                  ? "labels"
                  : "samples"
              } selected (positive)${
                form.negativeQueryIds.length > 0
                  ? ` \u00B7 ${form.negativeQueryIds.length} negative`
                  : ""
              }`}
            </Text>
          </QuerySelectorBoxActive>
        ) : (
          <QuerySelectorBoxInactive>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Select samples in the grid (Alt+click for negative)
            </Text>
          </QuerySelectorBoxInactive>
        )}

        {/* Number of matches */}
        <FormField
          label="Number of matches"
          error={
            form.kError ? "Number of results cannot exceed 10,000" : undefined
          }
          control={
            <Input
              type={InputType.Number}
              value={form.k === "" ? "" : String(form.k)}
              onChange={(e) => {
                const val = e.target.value;
                form.setK(val === "" ? "" : parseInt(val, 10));
              }}
              min={1}
              size={Size.Sm}
              error={form.kError}
            />
          }
        />

        {/* Reverse toggle */}
        {form.supportsLeast && (
          <Toggle
            checked={form.reverse}
            onChange={(checked) => form.setReverse(checked)}
            label="Least similar (reverse)"
            size={Size.Sm}
          />
        )}

        {/* Dynamic results */}
        <Toggle
          checked={form.dynamicResults}
          onChange={(checked) => form.setDynamicResults(checked)}
          label={
            form.dynamicResults
              ? "Dynamic results — results will always reflect the latest dataset state, but loading will be slower"
              : "Dynamic results"
          }
          size={Size.Sm}
        />

        {/* Distance field */}
        <FormField
          label="Distance field (optional)"
          description="Store distances as a sample field"
          control={
            <Input
              placeholder="e.g., similarity_dist"
              value={form.distField}
              onChange={(e) => form.setDistField(e.target.value)}
              size={Size.Sm}
            />
          }
        />

        {/* Search name */}
        <FormField
          label="Search name (optional)"
          control={
            <Input
              placeholder="My search"
              value={form.runName}
              onChange={(e) => form.setRunName(e.target.value)}
              size={Size.Sm}
            />
          }
        />

        {/* Submit */}
        <Stack justify={Justify.End}>
          <OperatorExecutionButton
            operatorUri={SEARCH_OPERATOR_URI}
            executionParams={form.executionParams}
            onOptionSelected={form.handleOptionSelected}
            onSuccess={form.handleSuccess}
            onError={form.handleError}
            disabled={!form.canSubmit || form.submitting}
            variant="contained"
          >
            {form.submitting ? "Searching..." : "Search"}
          </OperatorExecutionButton>
        </Stack>
      </Stack>
    </NewSearchContainer>
  );
}
