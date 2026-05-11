import type { Meta, StoryObj } from "@storybook/react";
import {
  Button,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { PlaybackProvider, usePlayback } from "../lib/PlaybackProvider";
import {
  currentTimeAtom,
  isBufferingAtom,
  isPlayingAtom,
  playheadAtom,
} from "../lib/playback-atoms";
import { PlaybackStreamBase } from "../lib/playback-stream-base";
import type { BufferReadiness } from "../lib/playback-types";
import { useStream } from "../lib/use-stream";

const meta: Meta = { title: "Playback/Engine" };
export default meta;

// ---------------------------------------------------------------------------
// A test stream that resolves to its current time as the value. Reports
// "ready" everywhere — the point is to demonstrate the subscription lifecycle,
// not real buffering behavior.
// ---------------------------------------------------------------------------
class TestStream extends PlaybackStreamBase<{ t: number }> {
  prefetchCalls = 0;
  bufferState(): BufferReadiness {
    return "ready";
  }
  prefetch(): void {
    this.prefetchCalls += 1;
  }
  getValue(t: number) {
    return { t };
  }
}

const stream = new TestStream("demo", { blocking: true });

// ---------------------------------------------------------------------------
// Consumer component — mounts conditionally to demonstrate subscriber count.
// ---------------------------------------------------------------------------
function Consumer({ label }: { label: string }) {
  const value = useStream<{ t: number }>("demo");
  return (
    <div
      style={{
        padding: 8,
        border: "1px solid var(--color-content-border-default)",
        borderRadius: 4,
      }}
    >
      <Text variant={TextVariant.Sm} color={TextColor.Primary}>
        <strong>{label}</strong>: {value ? value.t.toFixed(3) : "—"}
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engine demo — registers the stream once, lets the user toggle consumers
// and play/pause the clock. Shows live atoms in a panel.
// ---------------------------------------------------------------------------
function EngineDemo() {
  const { play, pause, seek, registerStream } = usePlayback();
  const isPlaying = useAtomValue(isPlayingAtom);
  const isBuffering = useAtomValue(isBufferingAtom);
  const playhead = useAtomValue(playheadAtom);
  const currentTime = useAtomValue(currentTimeAtom);

  const [consumerA, setConsumerA] = useState(false);
  const [consumerB, setConsumerB] = useState(false);

  useEffect(() => registerStream(stream), [registerStream]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 480 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant={Variant.Primary}
          size={Size.Sm}
          leadingIcon={isPlaying ? IconName.Toggle : IconName.ArrowRight}
          onClick={isPlaying ? pause : play}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button variant={Variant.Secondary} size={Size.Sm} onClick={() => seek(0)}>
          Seek 0
        </Button>
        <Button variant={Variant.Secondary} size={Size.Sm} onClick={() => seek(2.5)}>
          Seek 2.5s
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: "4px 16px",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        <span>playhead:</span><span>{playhead.toFixed(3)}</span>
        <span>currentTime:</span><span>{currentTime.toFixed(3)}</span>
        <span>isPlaying:</span><span>{String(isPlaying)}</span>
        <span>isBuffering:</span><span>{String(isBuffering)}</span>
        <span>subscribers:</span>
        <span>{Number(consumerA) + Number(consumerB)} (stream is {(consumerA || consumerB) ? "ACTIVE" : "DORMANT"})</span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <label>
          <input
            type="checkbox"
            checked={consumerA}
            onChange={(e) => setConsumerA(e.target.checked)}
          />
          Mount Consumer A
        </label>
        <label>
          <input
            type="checkbox"
            checked={consumerB}
            onChange={(e) => setConsumerB(e.target.checked)}
          />
          Mount Consumer B
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {consumerA && <Consumer label="A" />}
        {consumerB && <Consumer label="B" />}
        {!consumerA && !consumerB && (
          <em style={{ color: "var(--color-content-text-muted)" }}>
            No consumers — stream is dormant, engine skips it entirely.
          </em>
        )}
      </div>
    </div>
  );
}

export const SubscriberLifecycle: StoryObj = {
  render: () => (
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <EngineDemo />
    </PlaybackProvider>
  ),
};
