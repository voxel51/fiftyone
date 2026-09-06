/**
 * Preview. Shown only when there is something to decide — a resumable
 * upload, files that will not go, or a job big enough to be worth
 * confirming. Otherwise `usePush` auto-confirms and this never renders.
 */

import {
  Align,
  Button,
  Card,
  CardBackground,
  Checkbox,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";

import { previewSummary } from "../copy";
import { PushData } from "../types";

export interface PreviewStepProps {
  push: PushData;
  onConfirm(options: { fresh: boolean }): void;
  onBack(): void;
  confirming: boolean;
}

export function PreviewStep(props: PreviewStepProps) {
  const { push, onConfirm, onBack, confirming } = props;
  // The only producer of `fresh`; nothing else in the UI can discard resume
  // state.
  const [startOver, setStartOver] = useState(false);

  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        {push.preview && <Text>{previewSummary(push.preview)}</Text>}

        {push.resumable && (
          <Card background={CardBackground.Secondary} compact>
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <Text>
                {`A previous upload of “${push.dataset_name}” is ` +
                  `${push.resumable.uploaded}/${push.resumable.total} files ` +
                  `in — it will resume`}
              </Text>
              <Checkbox
                checked={startOver}
                onChange={setStartOver}
                label="Start over"
                size={Size.Sm}
              />
            </Stack>
          </Card>
        )}

        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
        >
          <Button
            variant={Variant.Primary}
            disabled={confirming}
            onClick={() => onConfirm({ fresh: startOver })}
          >
            Confirm
          </Button>
          <Button
            variant={Variant.Borderless}
            disabled={confirming}
            onClick={onBack}
          >
            Back
          </Button>
          {confirming && <Spinner size={Size.Sm} />}
        </Stack>
      </Stack>
    </Card>
  );
}
