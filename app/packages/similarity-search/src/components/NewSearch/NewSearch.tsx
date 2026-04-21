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
import { FileUploadOutlined } from "../../mui";
import React, { useState } from "react";
import { OperatorExecutionButton } from "@fiftyone/operators";
import {
  BrainKeyConfig,
  CloneConfig,
  QueryType,
  SearchScope,
} from "../../types";
import {
  SEARCH_OPERATOR_URI,
  CHECK_MARK,
  CROSS_MARK,
  MIDDLE_DOT,
  UPLOAD_ACCEPTED_TYPES,
  UPLOAD_MAX_SIZE,
} from "../../constants";
import { fileToBase64 } from "../../utils";
import { FileDrop } from "@fiftyone/core/src/plugins/SchemaIO/components";
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
  const [uploadError, setUploadError] = useState<string | null>(null);

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
              {form.selectedConfig.metric && (
                <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                  Metric: {form.selectedConfig.metric}
                </Text>
              )}
              {form.selectedConfig.identifiers?.map((id) => (
                <Text
                  key={id.label}
                  variant={TextVariant.Md}
                  color={TextColor.Secondary}
                >
                  {id.label}: {id.value}
                </Text>
              ))}
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
              size={Size.Md}
              style={{ display: "flex", flexDirection: "row", gap: "1rem" }}
            />
          }
        />

        {/* Query type toggle */}
        {(form.supportsPrompts || form.supportsUpload) && (
          <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
            <Button
              variant={
                form.queryType === QueryType.Image
                  ? Variant.Primary
                  : Variant.Secondary
              }
              size={Size.Sm}
              leadingIcon={IconName.ImageSearch}
              onClick={() => form.setQueryType(QueryType.Image)}
              style={{ flex: 1 }}
            >
              Image Search
            </Button>
            {form.supportsUpload && (
              <Button
                variant={
                  form.queryType === QueryType.Upload
                    ? Variant.Primary
                    : Variant.Secondary
                }
                size={Size.Sm}
                leadingIcon={() => <FileUploadOutlined sx={{ fontSize: 16 }} />}
                onClick={() => form.setQueryType(QueryType.Upload)}
                style={{ flex: 1 }}
              >
                Upload Image
              </Button>
            )}
            {form.supportsPrompts && (
              <Button
                variant={
                  form.queryType === QueryType.Text
                    ? Variant.Primary
                    : Variant.Secondary
                }
                size={Size.Sm}
                leadingIcon={IconName.Search}
                onClick={() => form.setQueryType(QueryType.Text)}
                style={{ flex: 1 }}
              >
                Text Search
              </Button>
            )}
          </Stack>
        )}

        {/* Query input */}
        {form.queryType === QueryType.Text && (
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
        )}

        {form.queryType === QueryType.Upload &&
          (form.uploadedImage ? (
            <QuerySelectorBoxActive>
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Sm}
                align={Align.Center}
                justify={Justify.Between}
              >
                <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                  {form.uploadedImage.name}
                </Text>
                <Button
                  variant={Variant.Secondary}
                  size={Size.Xs}
                  onClick={() => form.setUploadedImage(null)}
                >
                  Clear
                </Button>
              </Stack>
            </QuerySelectorBoxActive>
          ) : (
            <>
              <FileDrop
                types={UPLOAD_ACCEPTED_TYPES}
                onChange={async (files: File[]) => {
                  if (!files?.length) return;
                  const file = files[0];
                  if (file.size > UPLOAD_MAX_SIZE) {
                    setUploadError(
                      `File exceeds the 10 MB size limit (${(
                        file.size /
                        1024 /
                        1024
                      ).toFixed(1)} MB)`
                    );
                    return;
                  }
                  const { result, error } = await fileToBase64(file);
                  if (error || !result) {
                    setUploadError(
                      "Failed to read the image file. Please try again."
                    );
                    return;
                  }
                  setUploadError(null);
                  form.setUploadedImage({
                    content: result,
                    name: file.name,
                  });
                }}
              />
              {uploadError && (
                <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
                  {uploadError}
                </Text>
              )}
            </>
          ))}

        {form.queryType === QueryType.Image &&
          (form.queryIds.length > 0 ? (
            <QuerySelectorBoxActive>
              <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                {`${form.queryIds.length} ${
                  Array.isArray(form.selectedLabels) &&
                  form.selectedLabels.length > 0
                    ? "labels"
                    : "samples"
                } selected (positive)${
                  form.negativeQueryIds.length > 0
                    ? ` ${MIDDLE_DOT} ${form.negativeQueryIds.length} negative`
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
          ))}

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

        {/* Dynamic results — commented out; all searches use cached (static) results for now
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
        */}

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
