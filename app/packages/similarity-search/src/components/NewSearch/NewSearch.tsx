import { ArrowBackIcon as ArrowBack } from "../../mui";
import {
  Button,
  FormField,
  Heading,
  Input,
  InputType,
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
import { BrainKeyConfig, CloneConfig } from "../../types";
import { SEARCH_OPERATOR_URI } from "../../constants";
import { useNewSearchForm } from "../../hooks/useNewSearchForm";
import * as s from "../styles";

type NewSearchProps = {
  brainKeys: BrainKeyConfig[];
  cloneConfig?: CloneConfig | null;
  isPatchesView?: boolean;
  onBack: () => void;
  onSubmitted: () => void;
};

const BackIcon = () => <ArrowBack fontSize="small" />;

export default function NewSearch({
  brainKeys,
  cloneConfig,
  isPatchesView = false,
  onBack,
  onSubmitted,
}: NewSearchProps) {
  const form = useNewSearchForm(brainKeys, cloneConfig, onSubmitted);

  return (
    <div style={s.newSearchContainer}>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center", marginBottom: "1.5rem" }}
      >
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          leadingIcon={BackIcon}
          onClick={onBack}
        />
        <Heading level="h2">
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
          <div style={s.noBrainKeysWarning}>
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
                {form.selectedConfig.supports_prompts ? "\u2705" : "\u274C"}
              </Text>
            </Stack>
          </div>
        )}

        {brainKeys.length === 0 && (
          <div style={s.noBrainKeysWarning}>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              No similarity indexes found. Compute a similarity index on your
              dataset first.
            </Text>
          </div>
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
              onChange={(value) =>
                form.setSearchScope(value as "view" | "dataset")
              }
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
                form.queryType === "text" ? Variant.Primary : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => form.setQueryType("text")}
              style={{ flex: 1 }}
            >
              Text Search
            </Button>
            <Button
              variant={
                form.queryType === "image" ? Variant.Primary : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => form.setQueryType("image")}
              style={{ flex: 1 }}
            >
              Image Search
            </Button>
          </Stack>
        )}

        {/* Query input */}
        {form.queryType === "text" ? (
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
        ) : (
          <div
            style={
              form.queryIds.length > 0
                ? s.querySelectorBoxActive
                : s.querySelectorBoxInactive
            }
          >
            <Text
              variant={TextVariant.Sm}
              color={
                form.queryIds.length > 0
                  ? TextColor.Success
                  : TextColor.Secondary
              }
            >
              {form.queryIds.length > 0
                ? `${form.queryIds.length} ${
                    form.selectedLabels?.length > 0 ? "labels" : "samples"
                  } selected (positive)`
                : "Select samples in the grid"}
            </Text>
          </div>
        )}

        {/* Number of matches */}
        <FormField
          label="Number of matches"
          error={form.kError ? "Exceeds maximum of 10,000" : undefined}
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

        {/* Dynamic results */}
        <Toggle
          checked={form.dynamicResults}
          onChange={(checked) => form.setDynamicResults(checked)}
          label="Dynamic results"
          size={Size.Sm}
        />
        {form.dynamicResults && (
          <Text variant={TextVariant.Sm} color={TextColor.Muted}>
            Results will always reflect the latest dataset state, but loading
            will be slower.
          </Text>
        )}

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
        <div style={s.submitRow}>
          <OperatorExecutionButton
            operatorUri={SEARCH_OPERATOR_URI}
            executionParams={form.executionParams}
            onSuccess={form.handleSuccess}
            onError={form.handleError}
            disabled={!form.canSubmit}
            variant="contained"
          >
            Search
          </OperatorExecutionButton>
        </div>
      </Stack>
    </div>
  );
}
