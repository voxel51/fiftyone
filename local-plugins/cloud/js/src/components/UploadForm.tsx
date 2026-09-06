/**
 * Idle, connected: what to upload and what to call it.
 *
 * No resumable indicator here by design — the user has not chosen a cloud
 * name yet, so there is nothing to look up. PreviewStep owns that moment.
 */

import {
  Align,
  Button,
  Card,
  FormField,
  Input,
  Orientation,
  RadioGroup,
  Spacing,
  Stack,
  Variant,
} from "@voxel51/voodo";

import { CloudPanelSchemaView, PushTarget, UploadSelection } from "../types";

export interface UploadFormProps {
  view: CloudPanelSchemaView;
  selection: UploadSelection;
  onTargetChange(target: PushTarget): void;
  onDatasetNameChange(name: string): void;
  onUpload(): void;
}

function samples(count: number): string {
  return `${count} ${count === 1 ? "sample" : "samples"}`;
}

export function UploadForm(props: UploadFormProps) {
  const { view, selection, onTargetChange, onDatasetNameChange, onUpload } =
    props;

  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        {view.has_view && (
          <FormField
            label="What to upload"
            control={
              <RadioGroup
                value={selection.target}
                onChange={(value) => onTargetChange(value as PushTarget)}
                options={[
                  {
                    value: PushTarget.View,
                    label: `Current view (${samples(view.view_count)})`,
                  },
                  {
                    value: PushTarget.Dataset,
                    label: `Whole dataset (${samples(view.dataset_count)})`,
                  },
                ]}
              />
            }
          />
        )}

        <FormField
          label="Cloud dataset name"
          control={
            <Input
              value={selection.datasetName}
              onChange={(event) => onDatasetNameChange(event.target.value)}
              placeholder={view.local_dataset}
            />
          }
        />

        {/*
          "Upload" starts a preview, not a push. The label stays "Upload"
          because for most datasets the preview auto-confirms and the
          distinction never reaches the user.
        */}
        <Stack orientation={Orientation.Row} align={Align.Start}>
          <Button
            variant={Variant.Primary}
            disabled={selection.datasetName.trim().length === 0}
            onClick={onUpload}
          >
            Upload
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
