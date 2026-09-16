import { rangeDomain, type SegmentMember } from "./format";
import styles from "./SelectionTray.module.css";

interface Props {
  members: readonly SegmentMember[];
  /** Shared axis when several tracks must line up; defaults to this set. */
  domain?: [bigint, bigint] | null;
  tone?: "selected" | "current";
  className?: string;
}

/**
 * A compact bar-per-range preview on the episode's native axis. Purely
 * visual; the surrounding text carries the accessible range summary.
 */
export default function RangeTrack({
  members,
  domain,
  tone = "selected",
  className,
}: Props) {
  const bounds = domain ?? rangeDomain([members]);
  if (!bounds) return null;
  const [min, max] = bounds;
  const span = max - min || 1n;
  const percent = (value: string) =>
    Number(((BigInt(value) - min) * 10_000n) / span) / 100;
  return (
    <div
      className={[styles.track, className].filter(Boolean).join(" ")}
      data-tone={tone}
      aria-hidden="true"
    >
      {members.map((member, index) => {
        const left = percent(member.range.start);
        const width = Math.max(percent(member.range.end) - left, 1);
        return (
          <span
            key={`${member.range.start}:${member.range.end}:${index}`}
            className={styles.rangeBar}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}
