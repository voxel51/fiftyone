import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
  ZapIcon,
} from "@voxel51/voodo";
import { OPTIMIZING_QUERY_PERFORMANCE } from "@fiftyone/utilities";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { atom, useReverbState } from "@fiftyone/reverb";

const TITLE = "Query Performance is Enabled";

const showExpandedTooltip = atom({
  key: "showExpandedQueryPerformanceTooltip",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("showExpandedQueryPerformanceTooltip", {
      valueClass: "boolean",
    }),
  ],
});

const QueryPerformanceIcon = () => {
  const [showExpanded, setShowExpanded] = useReverbState(showExpandedTooltip);

  return (
    <Tooltip
      anchor="bottom"
      interactive={showExpanded}
      content={
        showExpanded ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 8,
              maxWidth: 231,
            }}
          >
            <Text variant={TextVariant.HeadingSm}>{TITLE}</Text>
            <Text color={TextColor.Secondary}>
              Fields that are indexed will have better query performance.
            </Text>
            <div style={{ display: "flex", gap: 4 }}>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                style={{ flexGrow: 1 }}
                onClick={() => {
                  window.open(OPTIMIZING_QUERY_PERFORMANCE, "_blank")?.focus();
                }}
              >
                View Documentation
              </Button>
              <Button
                variant={Variant.Borderless}
                size={Size.Sm}
                style={{ flexGrow: 1 }}
                onClick={() => setShowExpanded(false)}
              >
                Got it
              </Button>
            </div>
          </div>
        ) : (
          TITLE
        )
      }
      style={{ display: "flex" }}
    >
      <ZapIcon
        size={14}
        color={showExpanded ? TextColor.Warning : TextColor.Secondary}
      />
    </Tooltip>
  );
};

export default QueryPerformanceIcon;
