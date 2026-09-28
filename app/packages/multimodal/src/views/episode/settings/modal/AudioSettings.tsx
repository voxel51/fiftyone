import { useAudio } from "@fiftyone/playback";
import { memo } from "react";
import { SCENE_SOURCE_TYPE } from "../../../../ir";
import { useSceneSourcesByType } from "../../../../scene-inventory/react";
import SidebarGroup from "../controls/SidebarGroup";
import styles from "./SettingsSidebar.module.css";

type AudioFactRow = readonly [label: string, value: string | null];

/**
 * Audio metadata for the scene: one collapsible group per audio source,
 * listing what the container reported (format, rate, channels, duration)
 * alongside its live mixer state.
 *
 * Deliberately reads the FORMAT-NEUTRAL scene inventory and `useAudio()`
 * roster rather than anything MCAP-specific, so a non-MCAP audio dataset
 * populates this panel without changes here.
 */
const AudioSettings = memo(function AudioSettings() {
  const sources = useSceneSourcesByType(SCENE_SOURCE_TYPE.AUDIO);
  const { tracks, masterMuted } = useAudio();

  if (sources.length === 0) {
    return null;
  }

  const summary = `${sources.length} ${sources.length === 1 ? "source" : "sources"}`;

  return (
    <SidebarGroup defaultExpanded={false} summary={summary} title="Audio">
      {sources.map((source) => {
        const track = tracks.find((candidate) => candidate.id === source.id);
        const rows: AudioFactRow[] = [
          ["Topic", source.sourceName || null],
          ["Format", source.metadata?.["stream.encoding"] ?? null],
          ["Schema", source.metadata?.["stream.schema_name"] ?? null],
          ["Volume", track ? `${Math.round(track.volume * 100)}%` : null],
          [
            "State",
            track
              ? track.muted
                ? "Muted"
                : masterMuted
                  ? "Muted (master)"
                  : "Audible"
              : null,
          ],
        ];
        return (
          <SidebarGroup
            defaultExpanded={sources.length === 1}
            key={source.id}
            summary={track ? undefined : "not registered"}
            title={source.label}
          >
            <FactRows rows={rows} />
          </SidebarGroup>
        );
      })}
    </SidebarGroup>
  );
});

/** Label/value rows, mirroring `RecordingSettings`' presentation. */
function FactRows({ rows }: { readonly rows: readonly AudioFactRow[] }) {
  const visibleRows = rows.filter(
    (row): row is readonly [string, string] => row[1] !== null,
  );
  if (visibleRows.length === 0) return null;
  return (
    <div className={styles.statsRows}>
      {visibleRows.map(([label, value]) => (
        <div className={styles.statsRow} key={label}>
          <span>{label}</span>
          <span className={styles.statsValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

export default AudioSettings;
