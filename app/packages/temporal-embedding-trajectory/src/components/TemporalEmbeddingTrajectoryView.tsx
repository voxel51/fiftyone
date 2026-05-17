import React, { Suspense, useCallback, useMemo } from "react";
import Plot from "react-plotly.js";
import { usePanelContext, usePanelStatePartial } from "@fiftyone/spaces";

import { useTrajectoryData } from "../hooks/useTrajectoryData";
import { useFrameSync } from "../hooks/useFrameSync";
import { useCompareData } from "../hooks/useCompareData";
import { useFrameMedia } from "../hooks/useFrameMedia";
import {
  buildTraces,
  defaultJumpThreshold,
  findCursorIndex,
} from "../plot/buildTraces";
import { buildCompareTraces, compareLayout } from "../plot/buildCompareTraces";
import {
  buildScenesTraces,
  scenesFromBoundaries,
  scenesLayout,
} from "../plot/buildScenesTraces";
import { trajectoryConfig, trajectoryLayout } from "../plot/trajectoryLayout";
import JumpFrames, { JumpFrame } from "./JumpFrames";
import type { SceneTrajectory, TrajectoryViewProps, ViewMode } from "../types";

const TRAJECTORY_LENGTH_DEFAULT = 30;
const JUMP_SIGMA_DEFAULT = 2;
const CONTEXT_HALF = 2; // +/- frames around the selected frame

const ACCENT_A = "rgba(70, 140, 220, 0.95)";
const ACCENT_B = "rgba(230, 130, 50, 0.95)";
const ACCENT_BOTH = "rgba(80, 200, 140, 0.95)";
const ACCENT_SELECTED = "rgba(255, 220, 80, 1)";

function jumpsForScene(scene: SceneTrajectory, sigma: number): JumpFrame[] {
  const threshold = defaultJumpThreshold(scene.jump_dists, sigma);
  const out: JumpFrame[] = [];
  for (let i = 0; i < scene.jump_dists.length; i++) {
    if (scene.jump_dists[i] >= threshold && threshold > 0) {
      out.push({
        frameId: scene.frame_ids[i],
        frameNumber: scene.frame_numbers[i],
      });
    }
  }
  return out;
}

/**
 * Context frames around the user-selected frame: [center-N, ..., center, ..., center+N].
 * The center frame carries a yellow accent so the eye finds it instantly.
 */
function contextFramesFor(
  selectedFrame: number | null,
  sourceScene: SceneTrajectory | undefined,
  half: number = CONTEXT_HALF
): JumpFrame[] {
  if (selectedFrame == null || !sourceScene) return [];
  const idx = sourceScene.frame_numbers.indexOf(selectedFrame);
  if (idx === -1) return [];
  const start = Math.max(0, idx - half);
  const end = Math.min(sourceScene.frame_numbers.length, idx + half + 1);
  const out: JumpFrame[] = [];
  for (let i = start; i < end; i++) {
    out.push({
      frameId: sourceScene.frame_ids[i],
      frameNumber: sourceScene.frame_numbers[i],
      accent: i === idx ? ACCENT_SELECTED : undefined,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Compute action: shared between grid CTA and modal toolbar.
// All compute params (model, brain key, method, ...) are configured
// in the operator's own prompt dialog, so the panel just exposes the
// trigger.
// ──────────────────────────────────────────────────────────────────────

type ComputeBarProps = {
  onCompute: () => void;
};

function ComputeBar({ onCompute }: ComputeBarProps) {
  return (
    <button style={styles.button} onClick={onCompute}>
      Compute
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main panel body.
// ──────────────────────────────────────────────────────────────────────

function TemporalEmbeddingTrajectoryReady(props: TrajectoryViewProps) {
  // ── Panel state ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = usePanelStatePartial<ViewMode>(
    "viewMode",
    "scatter",
    true
  );
  const [selectedBrainKey, setSelectedBrainKey] = usePanelStatePartial<
    string | null
  >("selectedBrainKey", null, true);
  const [keyA, setKeyA] = usePanelStatePartial<string | null>(
    "compareKeyA",
    null,
    true
  );
  const [keyB, setKeyB] = usePanelStatePartial<string | null>(
    "compareKeyB",
    null,
    true
  );
  const [trajectoryLength, setTrajectoryLength] = usePanelStatePartial<number>(
    "trajectoryLength",
    TRAJECTORY_LENGTH_DEFAULT,
    true
  );
  const [jumpSigma, setJumpSigma] = usePanelStatePartial<number>(
    "jumpSigma",
    JUMP_SIGMA_DEFAULT,
    true
  );
  const [matchTolerance, setMatchTolerance] = usePanelStatePartial<number>(
    "matchTolerance",
    0,
    true
  );
  const [sceneSigma, setSceneSigma] = usePanelStatePartial<number>(
    "sceneSigma",
    1.5,
    true
  );
  const [selectedFrame, setSelectedFrame] = usePanelStatePartial<number | null>(
    "selectedFrame",
    null,
    true
  );

  // ── Data hooks ─────────────────────────────────────────────────────
  const { brainKeys, scene, triggers, currentSampleId } = useTrajectoryData(
    props,
    [selectedBrainKey, setSelectedBrainKey]
  );
  const { currentFrame, seekFrame, isTimelineActive } = useFrameSync();

  // Seed compare keys on first availability.
  React.useEffect(() => {
    if (brainKeys.length === 0) return;
    if (!keyA && selectedBrainKey) setKeyA(selectedBrainKey);
    if (!keyB) {
      const candidate = brainKeys.find(
        (bk) => bk.key !== (keyA || selectedBrainKey)
      );
      if (candidate) setKeyB(candidate.key);
    }
  }, [brainKeys, selectedBrainKey, keyA, keyB, setKeyA, setKeyB]);

  const compareKeysSel = useMemo(
    () => [keyA, keyB].filter((k): k is string => !!k),
    [keyA, keyB]
  );
  const { scenes: compareScenes } = useCompareData(
    props,
    currentSampleId,
    viewMode === "compare" || viewMode === "scenes" ? compareKeysSel : []
  );

  // ── Scatter derived state ──────────────────────────────────────────
  const jumpThreshold = useMemo(
    () => (scene ? defaultJumpThreshold(scene.jump_dists, jumpSigma ?? 2) : 0),
    [scene, jumpSigma]
  );
  const scatterTraces = useMemo(() => {
    if (!scene || scene.points.length === 0) return [];
    return buildTraces(scene, {
      trajectoryLength: trajectoryLength ?? TRAJECTORY_LENGTH_DEFAULT,
      jumpThreshold,
      currentFrameNumber: currentFrame,
    });
  }, [scene, trajectoryLength, jumpThreshold, currentFrame]);
  const scatterJumps = useMemo<JumpFrame[]>(
    () => (scene ? jumpsForScene(scene, jumpSigma ?? JUMP_SIGMA_DEFAULT) : []),
    [scene, jumpSigma]
  );

  // ── Compare / Scenes derived state ─────────────────────────────────
  const sceneA = keyA ? compareScenes[keyA] : undefined;
  const sceneB = keyB ? compareScenes[keyB] : undefined;

  const compareTracesAndDomain = useMemo(() => {
    const scenesList: Array<{ brainKey: string; scene: SceneTrajectory }> = [];
    if (keyA && sceneA) scenesList.push({ brainKey: keyA, scene: sceneA });
    if (keyB && sceneB) scenesList.push({ brainKey: keyB, scene: sceneB });
    return buildCompareTraces({
      scenes: scenesList,
      jumpSigma: jumpSigma ?? JUMP_SIGMA_DEFAULT,
      currentFrameNumber: currentFrame,
    });
  }, [keyA, keyB, sceneA, sceneB, jumpSigma, currentFrame]);

  const compareDiff = useMemo(() => {
    const sigma = jumpSigma ?? JUMP_SIGMA_DEFAULT;
    const tol = Math.max(0, Math.floor(matchTolerance ?? 0));
    const aJumps = sceneA ? jumpsForScene(sceneA, sigma) : [];
    const bJumps = sceneB ? jumpsForScene(sceneB, sigma) : [];
    const hasMatchIn = (target: number, others: JumpFrame[]): boolean =>
      others.some((o) => Math.abs(o.frameNumber - target) <= tol);
    const onlyA: JumpFrame[] = aJumps
      .filter((j) => !hasMatchIn(j.frameNumber, bJumps))
      .map((j) => ({ ...j, accent: ACCENT_A }));
    const onlyB: JumpFrame[] = bJumps
      .filter((j) => !hasMatchIn(j.frameNumber, aJumps))
      .map((j) => ({ ...j, accent: ACCENT_B }));
    const both: JumpFrame[] = aJumps
      .filter((j) => hasMatchIn(j.frameNumber, bJumps))
      .map((j) => ({ ...j, accent: ACCENT_BOTH }));
    return { onlyA, both, onlyB };
  }, [sceneA, sceneB, jumpSigma, matchTolerance]);

  const scenesPlot = useMemo(() => {
    const scenesList: Array<{
      brainKey: string;
      scene: SceneTrajectory;
      color: string;
    }> = [];
    if (keyA && sceneA)
      scenesList.push({ brainKey: keyA, scene: sceneA, color: ACCENT_A });
    if (keyB && sceneB)
      scenesList.push({ brainKey: keyB, scene: sceneB, color: ACCENT_B });
    return buildScenesTraces({
      scenes: scenesList,
      sigma: sceneSigma ?? 1.5,
      minPeakDistance: 30,
      currentFrameNumber: currentFrame,
    });
  }, [keyA, keyB, sceneA, sceneB, sceneSigma, currentFrame]);
  const scenesSegmentsA = useMemo(
    () =>
      keyA && sceneA && scenesPlot.boundariesByKey[keyA]
        ? scenesFromBoundaries(sceneA, scenesPlot.boundariesByKey[keyA])
        : [],
    [keyA, sceneA, scenesPlot]
  );
  const scenesSegmentsB = useMemo(
    () =>
      keyB && sceneB && scenesPlot.boundariesByKey[keyB]
        ? scenesFromBoundaries(sceneB, scenesPlot.boundariesByKey[keyB])
        : [],
    [keyB, sceneB, scenesPlot]
  );

  // ── Context preview frames around the user-selected frame ──────────
  // Source the surrounding frames from whichever scene we currently
  // have loaded — they're all keyed by the same parent video, so the
  // frame_ids around `selectedFrame` are identical.
  const contextSourceScene = sceneA ?? sceneB ?? scene ?? undefined;
  const contextFrames = useMemo(
    () => contextFramesFor(selectedFrame ?? null, contextSourceScene),
    [selectedFrame, contextSourceScene]
  );

  // ── Frame-media batching ───────────────────────────────────────────
  const thumbnailFrameIds = useMemo(() => {
    const ids: string[] = [];
    if (viewMode === "scatter") {
      ids.push(...scatterJumps.map((j) => j.frameId));
    } else if (viewMode === "compare") {
      ids.push(
        ...[
          ...compareDiff.onlyA,
          ...compareDiff.both,
          ...compareDiff.onlyB,
        ].map((j) => j.frameId)
      );
    } else {
      ids.push(...scenesSegmentsA.map((s) => s.frameId));
      ids.push(...scenesSegmentsB.map((s) => s.frameId));
    }
    // Always include the context-preview frames so they show as soon
    // as the user clicks anywhere.
    ids.push(...contextFrames.map((f) => f.frameId));
    return ids;
  }, [
    viewMode,
    scatterJumps,
    compareDiff,
    scenesSegmentsA,
    scenesSegmentsB,
    contextFrames,
  ]);
  const { media: frameMedia } = useFrameMedia(props, thumbnailFrameIds);

  // ── Click handlers ─────────────────────────────────────────────────
  const handleSelectFrame = useCallback(
    (frameNumber: number) => {
      setSelectedFrame(frameNumber);
      seekFrame(frameNumber);
    },
    [seekFrame, setSelectedFrame]
  );

  const handlePlotClick = useCallback(
    (event: any) => {
      const pt = event?.points?.[0];
      if (!pt) return;
      let frameNumber: number | undefined;
      const cd = pt.customdata;
      if (Array.isArray(cd)) {
        frameNumber = typeof cd[0] === "string" ? Number(cd[1]) : Number(cd[0]);
      } else if (cd != null) {
        frameNumber = Number(cd);
      }
      if (frameNumber == null || Number.isNaN(frameNumber)) return;
      handleSelectFrame(frameNumber);

      // Cross-sample fallback (only matters in scatter mode).
      if (
        viewMode === "scatter" &&
        scene &&
        currentSampleId &&
        currentSampleId !== scene.sample_id
      ) {
        triggers.seekToFrame({
          sample_id: scene.sample_id,
          frame_number: frameNumber,
        });
      }
    },
    [viewMode, scene, handleSelectFrame, triggers, currentSampleId]
  );

  const handleCompute = useCallback(() => {
    // No pre-filled params — the user picks model / brain key / method
    // in the operator's prompt dialog.
    triggers.computeTrajectory({});
  }, [triggers]);

  const noBrainKeys = brainKeys.length === 0;
  const cursorIdx = scene
    ? findCursorIndex(scene.frame_numbers, currentFrame)
    : -1;

  // ── Grid surface — no sample open ──────────────────────────────────
  if (!currentSampleId) {
    return (
      <div style={styles.root}>
        <div style={styles.gridCta}>
          <p style={styles.gridCtaTitle}>
            {noBrainKeys
              ? "Pick a model and click Compute to embed your video frames."
              : "Open a video sample in the modal to view its trajectory."}
          </p>
          <p style={styles.hint}>
            Compute runs as a delegated operator; on a large dataset it can take
            a few minutes.
          </p>
          <ComputeBar onCompute={handleCompute} />
        </div>
      </div>
    );
  }

  // ── Modal surface — full panel ─────────────────────────────────────
  const statusLeft = (() => {
    if (viewMode === "scatter") {
      return scene
        ? `${scene.points.length} frames · ${scatterJumps.length} jumps`
        : "no scene loaded";
    }
    if (viewMode === "compare") {
      return `${compareDiff.onlyA.length} only A · ${compareDiff.both.length} both · ${compareDiff.onlyB.length} only B`;
    }
    return `${scenesSegmentsA.length} scenes (A) · ${scenesSegmentsB.length} scenes (B)`;
  })();

  return (
    <div style={styles.root}>
      {/* ── Row 1: mode tabs · key selection · compute action ──────── */}
      <div style={styles.toolbarRow}>
        <div style={styles.modeToggle}>
          {(["scatter", "compare", "scenes"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              style={{
                ...styles.modeButton,
                ...(viewMode === m ? styles.modeButtonActive : {}),
              }}
            >
              {m === "scatter"
                ? "Scatter"
                : m === "compare"
                ? "Compare"
                : "Scenes"}
            </button>
          ))}
        </div>

        {viewMode === "scatter" ? (
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Brain key</span>
            <select
              style={styles.select}
              value={selectedBrainKey ?? ""}
              onChange={(e) => setSelectedBrainKey(e.target.value || null)}
              disabled={noBrainKeys}
            >
              {noBrainKeys ? (
                <option value="">(none — compute first)</option>
              ) : (
                brainKeys.map((bk) => (
                  <option key={bk.key} value={bk.key}>
                    {bk.key} {bk.model ? `· ${bk.model}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : (
          <>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>
                Model A <span style={{ color: ACCENT_A }}>●</span>
              </span>
              <select
                style={styles.select}
                value={keyA ?? ""}
                onChange={(e) => setKeyA(e.target.value || null)}
                disabled={noBrainKeys}
              >
                <option value="">—</option>
                {brainKeys.map((bk) => (
                  <option key={bk.key} value={bk.key}>
                    {bk.key}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>
                Model B <span style={{ color: ACCENT_B }}>●</span>
              </span>
              <select
                style={styles.select}
                value={keyB ?? ""}
                onChange={(e) => setKeyB(e.target.value || null)}
                disabled={noBrainKeys}
              >
                <option value="">—</option>
                {brainKeys.map((bk) => (
                  <option key={bk.key} value={bk.key}>
                    {bk.key}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div style={styles.spacer} />

        <ComputeBar onCompute={handleCompute} />
      </div>

      {/* ── Row 2: per-mode display controls ───────────────────────── */}
      <div style={styles.toolbarRow}>
        {viewMode === "scatter" && (
          <>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>
                Trajectory length: {trajectoryLength}
              </span>
              <input
                type="range"
                min={2}
                max={200}
                value={trajectoryLength ?? TRAJECTORY_LENGTH_DEFAULT}
                onChange={(e) => setTrajectoryLength(Number(e.target.value))}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Jump σ: {jumpSigma}</span>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.1}
                value={jumpSigma ?? JUMP_SIGMA_DEFAULT}
                onChange={(e) => setJumpSigma(Number(e.target.value))}
              />
            </label>
          </>
        )}

        {viewMode === "compare" && (
          <>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Jump σ: {jumpSigma}</span>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.1}
                value={jumpSigma ?? JUMP_SIGMA_DEFAULT}
                onChange={(e) => setJumpSigma(Number(e.target.value))}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>
                Match tol: ±{matchTolerance ?? 0} fr
              </span>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={matchTolerance ?? 0}
                onChange={(e) => setMatchTolerance(Number(e.target.value))}
              />
            </label>
          </>
        )}

        {viewMode === "scenes" && (
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Scene σ: {sceneSigma}</span>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={sceneSigma ?? 1.5}
              onChange={(e) => setSceneSigma(Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {/* ── Plot area ──────────────────────────────────────────────── */}
      <div style={styles.plotWrap}>
        {viewMode === "scatter" ? (
          scatterTraces.length === 0 ? (
            <div style={styles.empty}>
              {noBrainKeys ? (
                <p>Compute a brain key first.</p>
              ) : (
                <p>
                  No embeddings found for this scene under "{selectedBrainKey}".
                </p>
              )}
            </div>
          ) : (
            <Plot
              data={scatterTraces as any}
              layout={trajectoryLayout()}
              config={trajectoryConfig as any}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              onClick={handlePlotClick}
            />
          )
        ) : viewMode === "compare" ? (
          compareTracesAndDomain.traces.length === 0 ? (
            <div style={styles.empty}>
              {noBrainKeys ? (
                <p>Compute at least one brain key first.</p>
              ) : !keyA && !keyB ? (
                <p>Pick brain keys for Model A and Model B.</p>
              ) : (
                <p>Loading compare data…</p>
              )}
            </div>
          ) : (
            <Plot
              data={compareTracesAndDomain.traces as any}
              layout={
                compareLayout(
                  compareTracesAndDomain.domain,
                  currentFrame
                ) as any
              }
              config={trajectoryConfig as any}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              onClick={handlePlotClick}
            />
          )
        ) : scenesPlot.traces.length === 0 ? (
          <div style={styles.empty}>
            {noBrainKeys ? (
              <p>Compute at least one brain key first.</p>
            ) : !keyA && !keyB ? (
              <p>Pick brain keys for Model A and Model B.</p>
            ) : (sceneA &&
                !(sceneA.scene_shifts && sceneA.scene_shifts.length)) ||
              (sceneB &&
                !(sceneB.scene_shifts && sceneB.scene_shifts.length)) ? (
              <p>
                No scene-shift data for this brain key — re-run Compute to
                populate the <code>_scene_shift</code> field.
              </p>
            ) : (
              <p>Loading scenes data…</p>
            )}
          </div>
        ) : (
          <Plot
            data={scenesPlot.traces as any}
            layout={scenesLayout(scenesPlot.domain, currentFrame) as any}
            config={trajectoryConfig as any}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            onClick={handlePlotClick}
          />
        )}
      </div>

      {/* ── Thumbnails area ────────────────────────────────────────── */}
      <div style={styles.thumbsArea}>
        {viewMode === "scatter" ? (
          scene && scatterJumps.length > 0 ? (
            <JumpFrames
              title="jump frames"
              frames={scatterJumps}
              media={frameMedia}
              onClickFrame={handleSelectFrame}
            />
          ) : null
        ) : viewMode === "compare" ? (
          keyA || keyB ? (
            <div style={styles.diffRow}>
              {keyA ? (
                <div style={styles.diffCol}>
                  <JumpFrames
                    title={`only ${keyA}`}
                    frames={compareDiff.onlyA}
                    media={frameMedia}
                    onClickFrame={handleSelectFrame}
                  />
                </div>
              ) : null}
              <div style={styles.diffCol}>
                <JumpFrames
                  title="both"
                  frames={compareDiff.both}
                  media={frameMedia}
                  onClickFrame={handleSelectFrame}
                />
              </div>
              {keyB ? (
                <div style={styles.diffCol}>
                  <JumpFrames
                    title={`only ${keyB}`}
                    frames={compareDiff.onlyB}
                    media={frameMedia}
                    onClickFrame={handleSelectFrame}
                  />
                </div>
              ) : null}
            </div>
          ) : null
        ) : (
          <div
            style={
              keyA && keyB
                ? { ...styles.diffRow, gridTemplateColumns: "1fr 1fr" }
                : styles.diffRow
            }
          >
            {keyA && scenesSegmentsA.length > 0 ? (
              <div style={styles.diffCol}>
                <JumpFrames
                  title={`${keyA} scenes`}
                  frames={scenesSegmentsA.map((s) => ({
                    frameId: s.frameId,
                    frameNumber: s.startFrame,
                    accent: ACCENT_A,
                  }))}
                  media={frameMedia}
                  onClickFrame={handleSelectFrame}
                />
              </div>
            ) : null}
            {keyB && scenesSegmentsB.length > 0 ? (
              <div style={styles.diffCol}>
                <JumpFrames
                  title={`${keyB} scenes`}
                  frames={scenesSegmentsB.map((s) => ({
                    frameId: s.frameId,
                    frameNumber: s.startFrame,
                    accent: ACCENT_B,
                  }))}
                  media={frameMedia}
                  onClickFrame={handleSelectFrame}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Context preview: ±N frames around the currently selected frame */}
        {contextFrames.length > 0 ? (
          <div style={styles.contextPreview}>
            <JumpFrames
              title={`context · frame ${selectedFrame}`}
              frames={contextFrames}
              media={frameMedia}
              onClickFrame={handleSelectFrame}
              thumbSize={140}
            />
          </div>
        ) : null}
      </div>

      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div style={styles.status}>
        <span>{statusLeft}</span>
        <span>
          {currentFrame != null
            ? `current frame: ${currentFrame}${
                viewMode === "scatter" && cursorIdx >= 0
                  ? ` (idx ${cursorIdx})`
                  : ""
              }`
            : isTimelineActive
            ? "waiting for timeline"
            : "timeline inactive — open a video modal"}
        </span>
      </div>
    </div>
  );
}

export default function TemporalEmbeddingTrajectoryView(
  props: TrajectoryViewProps
) {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id;
  if (!panelId) return null;

  return (
    <Suspense fallback={<div style={styles.empty}>Loading…</div>}>
      <TemporalEmbeddingTrajectoryReady {...props} />
    </Suspense>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: 0,
    background: "transparent",
    color: "rgba(220,220,220,0.92)",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  toolbarRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    padding: "6px 12px",
    borderBottom: "1px solid rgba(120,120,140,0.18)",
    alignItems: "flex-end",
  },
  spacer: {
    flex: 1,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 140,
  },
  fieldLabel: {
    fontSize: 11,
    color: "rgba(180,180,200,0.85)",
  },
  select: {
    background: "rgba(40,40,55,0.7)",
    color: "inherit",
    border: "1px solid rgba(120,120,150,0.25)",
    borderRadius: 4,
    padding: "4px 6px",
    fontSize: 12,
  },
  modeToggle: {
    display: "flex",
    border: "1px solid rgba(120,120,150,0.25)",
    borderRadius: 4,
    overflow: "hidden",
    alignSelf: "flex-end",
  },
  modeButton: {
    background: "rgba(40,40,55,0.4)",
    color: "rgba(220,220,220,0.85)",
    border: "none",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    minWidth: 80,
  },
  modeButtonActive: {
    background: "rgba(70,140,220,0.85)",
    color: "white",
  },
  button: {
    background: "rgba(70,140,220,0.85)",
    color: "white",
    border: "none",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    alignSelf: "flex-end",
  },
  plotWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  thumbsArea: {
    padding: "8px 12px",
    borderTop: "1px solid rgba(120,120,140,0.18)",
    overflowY: "auto",
    maxHeight: "40%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  diffRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
  },
  diffCol: {
    minWidth: 0,
  },
  contextPreview: {
    borderTop: "1px dashed rgba(120,120,140,0.25)",
    paddingTop: 8,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "rgba(170,170,190,0.85)",
    fontSize: 13,
    textAlign: "center",
    padding: 16,
  },
  gridCta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: "100%",
    padding: 24,
    textAlign: "center",
  },
  gridCtaTitle: {
    fontSize: 14,
    color: "rgba(220,220,230,0.9)",
    margin: 0,
  },
  hint: {
    color: "rgba(140,140,160,0.7)",
    fontSize: 11,
    maxWidth: 360,
    margin: 0,
  },
  status: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 12px",
    fontSize: 11,
    color: "rgba(160,160,180,0.7)",
    borderTop: "1px solid rgba(120,120,140,0.18)",
  },
};
