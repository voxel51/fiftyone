import {
  Button,
  cssVar,
  ErrorOutlineIcon,
  Heading,
  HeadingLevel,
  Modal,
  ModalSize,
  OpenInNewIcon,
  PauseIcon,
  PlayArrowIcon,
  RichButton,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import AgentGlyph from "./AgentGlyph";
import styles from "./AgentShowcase.module.css";
import trayStyles from "./SelectionTray.module.css";

const AGENT_URL = "https://voxel51.com/voxel51-agent";
/** Tagged like the header's Enterprise link, so visits from here are attributed. */
const LEARN_MORE_URL = `${AGENT_URL}?${new URLSearchParams({
  utm_source: "FiftyOneApp",
  utm_medium: "in-app",
  utm_campaign: "voxel51-agent",
  utm_content: "selection-tray",
})}`;
const RECORDINGS =
  "https://storage.googleapis.com/public-assets-in-app/voxel51-agent-assets";

interface Capability {
  /** Also names the capability's recording. */
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

/** What the agent does, in the order the showcase plays it. */
const CAPABILITIES: readonly Capability[] = [
  {
    id: "data-discovery",
    title: "Data discovery",
    subtitle: "Search your dataset with natural language.",
  },
  {
    id: "automated-annotation-qa",
    title: "Automated annotation QA",
    subtitle: "Catch label issues with automated quality checks.",
  },
  {
    id: "data-work-automation",
    title: "Data work automation",
    subtitle: "Use natural language to automate repetitive data work.",
  },
  {
    id: "model-evaluation",
    title: "Model evaluation",
    subtitle: "Quickly surface underperforming classes and failure patterns.",
  },
  {
    id: "custom-plugins",
    title: "Custom plugins",
    subtitle: "Extend Voxel51 Agent with custom capabilities.",
  },
];

/**
 * VOODO tokens exposed to the stylesheet. The modal is portaled, so each
 * portaled root applies this style object itself.
 */
const showcaseTheme = {
  "--agent-stage": cssVar.color.bg.background,
  "--agent-border": cssVar.color.border.subtle,
  "--agent-skeleton": cssVar.color.skeleton.base,
  "--agent-shimmer": cssVar.color.skeleton.shimmer,
  "--agent-overlay": cssVar.color.overlay.heavy,
  "--agent-focus": cssVar.color.focus.ring,
  "--agent-font-xs": cssVar.text.xs,
  "--agent-space-sm": cssVar.spacing.sm,
  "--agent-space-md": cssVar.spacing.md,
  "--agent-space-lg": cssVar.spacing.lg,
  "--agent-duration": cssVar.transition.duration.normal,
  "--agent-easing": cssVar.transition.easing.out,
} as CSSProperties;

type PlayerState = "loading" | "ready" | "unavailable";

/** The player's frame while a recording loads, or when it cannot. */
function PlayerSkeleton({ unavailable }: { unavailable: boolean }) {
  return (
    <div
      className={styles.skeleton}
      data-unavailable={unavailable || undefined}
      role="status"
    >
      <div className={styles.skeletonCenter}>
        {unavailable ? (
          <>
            <ErrorOutlineIcon size={20} color={TextColor.Tertiary} />
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Video not accessible
            </Text>
          </>
        ) : (
          <>
            <span className={styles.skeletonPlay} aria-hidden="true" />
            <span className={trayStyles.visuallyHidden}>Loading video</span>
          </>
        )}
      </div>
      <div className={styles.skeletonControls} aria-hidden="true">
        <span className={styles.skeletonButton} />
        <span className={styles.skeletonTrack} />
        <span className={styles.skeletonTime} />
      </div>
    </div>
  );
}

/** One capability's recording, muted and inline, with a pause control. */
function Player({
  capability,
  autoPlay,
  panelId,
  tabId,
  onEnded,
}: {
  capability: Capability;
  autoPlay: boolean;
  panelId: string;
  tabId: string;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlayerState>("loading");
  const [paused, setPaused] = useState(!autoPlay);
  const toggle = () => {
    const element = video.current;
    if (!element || state !== "ready") return;
    if (element.paused) void element.play().catch(() => setPaused(true));
    else element.pause();
  };
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      aria-busy={state === "loading" || undefined}
      className={styles.player}
      data-state={state}
      data-paused={paused || undefined}
    >
      <video
        ref={video}
        className={styles.video}
        src={`${RECORDINGS}/${capability.id}.webm`}
        aria-label={`${capability.title} with Voxel51 Agent`}
        muted
        playsInline
        preload="auto"
        autoPlay={autoPlay}
        onLoadedData={() => setState("ready")}
        onError={() => setState("unavailable")}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={onEnded}
        onClick={toggle}
      />
      {state === "ready" ? (
        <Button
          size={Size.Sm}
          variant={Variant.Icon}
          className={styles.playToggle}
          leadingIcon={paused ? PlayArrowIcon : PauseIcon}
          aria-label={paused ? "Play" : "Pause"}
          onClick={toggle}
        />
      ) : (
        <PlayerSkeleton unavailable={state === "unavailable"} />
      )}
    </div>
  );
}

/**
 * The capabilities as a vertical tab list beside the player. Only the chosen
 * recording loads; when it ends the next one plays, so an idle viewer sees
 * the whole tour.
 */
function Showcase() {
  const baseId = useId();
  const [active, setActive] = useState(0);
  // Motion-sensitive viewers start each recording themselves.
  const [autoPlay] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const tabId = (index: number) => `${baseId}-tab-${index}`;
  const panelId = `${baseId}-panel`;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = CAPABILITIES.length - 1;
    const next =
      event.key === "ArrowDown"
        ? active === last
          ? 0
          : active + 1
        : event.key === "ArrowUp"
          ? active === 0
            ? last
            : active - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(next);
    event.currentTarget
      .querySelectorAll<HTMLElement>('[role="tab"]')
      [next]?.focus();
  };
  const capability = CAPABILITIES[active];

  return (
    <div className={styles.showcase} style={showcaseTheme}>
      <div className={styles.intro}>
        <div className={styles.header}>
          <span className={styles.title}>
            <AgentGlyph size={22} />
            <Heading level={HeadingLevel.H3}>Voxel51 Agent</Heading>
          </span>
          <span className={styles.exclusive}>
            <span className={styles.exclusiveLabel}>Only in Voxel51</span>
          </span>
        </div>
        <Text
          variant={TextVariant.Md}
          color={TextColor.Secondary}
          className={styles.lede}
        >
          Talk to your data. Voxel51 Agent turns plain-language requests into
          searches, quality checks, and automated workflows across your
          datasets.
        </Text>
      </div>
      <div className={styles.stage}>
        <div
          role="tablist"
          aria-label="What Voxel51 Agent can do"
          aria-orientation="vertical"
          className={styles.tabs}
          onKeyDown={onKeyDown}
        >
          {CAPABILITIES.map((item, index) => (
            <RichButton
              key={item.id}
              id={tabId(index)}
              role="tab"
              aria-selected={index === active}
              aria-controls={panelId}
              tabIndex={index === active ? 0 : -1}
              className={styles.tab}
              active={index === active}
              label={item.title}
              description={item.subtitle}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <Player
          key={capability.id}
          capability={capability}
          autoPlay={autoPlay}
          panelId={panelId}
          tabId={tabId(active)}
          onEnded={() =>
            setActive(active === CAPABILITIES.length - 1 ? 0 : active + 1)
          }
        />
      </div>
    </div>
  );
}

/** What the agent does, for a workspace that does not have it. */
export default function AgentShowcase({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={ModalSize.Xl}
      // The showcase draws its own header so availability can sit opposite
      // the name; "Not now", Escape, and the backdrop dismiss it.
      aria-label="Voxel51 Agent"
      showCloseButton={false}
      footer={
        <>
          <Button size={Size.Md} variant={Variant.Borderless} onClick={onClose}>
            Not now
          </Button>
          <Button
            size={Size.Md}
            variant={Variant.Primary}
            trailingIcon={OpenInNewIcon}
            href={LEARN_MORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more
          </Button>
        </>
      }
    >
      {/* Mounted only while open, so every visit starts the tour over. */}
      <Showcase />
    </Modal>
  );
}
