import {
  Align,
  Button,
  Card,
  Justify,
  Loader,
  Size,
  Spacing,
  Stack,
  Text,
  TextVariant,
  Variant,
} from "@voxel51/voodo";

export interface PendingRunsNoticeProps {
  label: string;
  viewLabel?: string;
  onView?: () => void;
}

export default function PendingRunsNotice({
  label,
  viewLabel = "View",
  onView,
}: PendingRunsNoticeProps) {
  return (
    <Card outlined data-testid="pending-runs-notice">
      <Stack align={Align.Center} justify={Justify.Between}>
        <Stack align={Align.Center} spacing={Spacing.Sm}>
          <Loader
            type="spinner"
            size={Size.Sm}
            role="status"
            aria-label="Loading"
          />
          <Text variant={TextVariant.Md}>{label}</Text>
        </Stack>
        {onView && (
          <Button size={Size.Sm} variant={Variant.Borderless} onClick={onView}>
            {viewLabel}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
