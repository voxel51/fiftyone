import {
  Button,
  CheckIcon,
  Divider,
  Dropdown,
  DropdownTrigger,
  MenuTextItem,
  OpenInNewIcon,
  Text,
} from "@voxel51/voodo";
import { trayTheme } from "./theme";
import styles from "./SimilaritySettings.module.css";

const RESULT_COUNTS = [10, 25, 50, 100, 250, 500, 1000];

/** Inline index and result-count settings beneath the tray's overflow actions. */
export default function SimilaritySettings({
  indexes,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  onOpenPanel,
}: {
  indexes: readonly { key: string; label: string }[];
  selectedKey: string | undefined;
  onSelectKey: (key: string) => void;
  k: number;
  onChangeK: (k: number) => void;
  onOpenPanel: () => void;
}) {
  const selected = indexes.find((index) => index.key === selectedKey);
  // Retain a custom count previously set in the view bar.
  const counts = [...new Set([...RESULT_COUNTS, k])].sort((a, b) => a - b);
  return (
    <div
      role="group"
      aria-label="Find similar settings"
      data-tray-similarity-settings=""
      style={trayTheme}
    >
      <Divider role="separator" orientation="row" className={styles.divider} />
      <div className={styles.settings}>
        <Text variant="body-primary">Find similar</Text>
        <div className={styles.settingRow}>
          <Text variant="body-secondary" color="text-secondary">
            Index
          </Text>
          <Dropdown
            className={styles.picker}
            trigger={
              <DropdownTrigger
                aria-label="Similarity index"
                className={styles.pickerTrigger}
              >
                <span className={styles.truncate} title={selected?.label}>
                  {selected?.label ?? "Choose an index"}
                </span>
              </DropdownTrigger>
            }
          >
            {indexes.map((index) => (
              <MenuTextItem
                key={index.key}
                aria-current={index.key === selectedKey}
                onClick={() => onSelectKey(index.key)}
              >
                <span className={styles.option}>
                  <Text variant="body-secondary">{index.label}</Text>
                  {index.key === selectedKey && <CheckIcon size="sm" />}
                </span>
              </MenuTextItem>
            ))}
          </Dropdown>
        </div>
        <div className={styles.settingRow}>
          <Text variant="body-secondary" color="text-secondary">
            Results
          </Text>
          <Dropdown
            className={styles.picker}
            trigger={
              <DropdownTrigger
                aria-label="Number of results"
                className={styles.pickerTrigger}
              >
                {`Top ${k.toLocaleString()}`}
              </DropdownTrigger>
            }
          >
            {counts.map((count) => (
              <MenuTextItem
                key={count}
                aria-current={count === k}
                onClick={() => onChangeK(count)}
              >
                <span className={styles.option}>
                  <Text variant="body-secondary">{`Top ${count.toLocaleString()}`}</Text>
                  {count === k && <CheckIcon size="sm" />}
                </span>
              </MenuTextItem>
            ))}
          </Dropdown>
        </div>
        <Button
          size="sm"
          variant="borderless"
          trailingIcon={OpenInNewIcon}
          className={styles.openPanel}
          onClick={onOpenPanel}
        >
          Open search panel
        </Button>
      </div>
    </div>
  );
}
