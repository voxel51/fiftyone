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
import { trajectoryConfig, trajectoryLayout } from "../plot/trajectoryLayout";
import JumpFrames, { JumpFrame } from "./JumpFrames";
import type { SceneTrajectory, TrajectoryViewProps, ViewMode } from "../types";

const TRAJECTORY_LENGTH_DEFAULT = 30;
const JUMP_SIGMA_DEFAULT = 2;
const MODEL_CHOICES: Array<{ value: string; label: string }> = [
  { value: "clip-vit-base32-torch", label: "CLIP ViT-B/32 (semantic)" },
  { value: "dinov2-vitb14-torch", label: "DINOv2 ViT-B/14 (visual)" },
];

const ACCENT_A = "rgba(70, 140, 220, 0.95)";
const ACCENT_B = "rgba(230, 130, 50, 0.95)";
const ACCENT_BOTH = "rgba(80, 200, 140, 0.95)";

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

function TemporalEmbeddingTrajectoryReady(props: TrajectoryViewProps) {
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
  const [composeModel, setComposeModel] = usePanelStatePartial<string>(
    "composeModel",
    MODEL_CHOICES[0].value,
    true
  );

  const { brainKeys, scene, triggers, currentSampleId } = useTrajectoryData(
    props,
    [selectedBrainKey, setSelectedBrainKey]
  );

  const { currentFrame, seekFrame, isTimelineActive } = useFrameSync();

  // Seed compare keys on first availability: A = current scatter key,
  // B = next available key (if any).
  React.useEffect(() => {
    if (brainKeys.length === 0) return;
    if (!keyA && selectedBrainKey) {
      setKeyA(selectedBrainKey);
    }
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
    viewMode === "compare" ? compareKeysSel : []
  );

  // ── Scatter mode derived state ─────────────────────────────────────
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

  // ── Compare mode derived state ─────────────────────────────────────
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

    // Within-tolerance membership: O(N*M) but jump counts are small
    // (tens, not thousands). For tol=0 this collapses to exact set
    // membership.
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

  // Collect every frame id we want a thumbnail for, across the active
  // mode, so we batch a single get_frame_media request.
  const thumbnailFrameIds = useMemo(() => {
    if (viewMode === "scatter") {
      return scatterJumps.map((j) => j.frameId);
    }
    return [
      ...compareDiff.onlyA,
      ...compareDiff.both,
      ...compareDiff.onlyB,
    ].map((j) => j.frameId);
  }, [viewMode, scatterJumps, compareDiff]);

  const { media: frameMedia } = useFrameMedia(props, thumbnailFrameIds);

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

      seekFrame(frameNumber);

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
    [viewMode, scene, seekFrame, triggers, currentSampleId]
  );

  const handleCompute = useCallback(() => {
    triggers.computeTrajectory({
      model: composeModel ?? MODEL_CHOICES[0].value,
      brain_key:
        selectedBrainKey ??
        (brainKeys[0]?.key as string | undefined) ??
        "temporal_trajectory",
    });
  }, [triggers, composeModel, selectedBrainKey, brainKeys]);

  const noBrainKeys = brainKeys.length === 0;
  const cursorIdx = scene
    ? findCursorIndex(scene.frame_numbers, currentFrame)
    : -1;

  const statusLeft = (() => {
    if (viewMode === "scatter") {
      return scene
        ? `${scene.points.length} frames · ${scatterJumps.length} jumps`
        : "no scene loaded";
    }
    return `${compareDiff.onlyA.length} only A · ${compareDiff.both.length} both · ${compareDiff.onlyB.length} only B`;
  })();

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div style={styles.modeToggle}>
          <button
            onClick={() => setViewMode("scatter")}
            style={{
              ...styles.modeButton,
              ...(viewMode === "scatter" ? styles.modeButtonActive : {}),
            }}
          >
            Scatter
          </button>
          <button
            onClick={() => setViewMode("compare")}
            style={{
              ...styles.modeButton,
              ...(viewMode === "compare" ? styles.modeButtonActive : {}),
            }}
          >
            Compare
          </button>
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

        <label style={styles.field}>
          <span style={styles.fieldLabel}>Compute model</span>
          <select
            style={styles.select}
            value={composeModel ?? MODEL_CHOICES[0].value}
            onChange={(e) => setComposeModel(e.target.value)}
          >
            {MODEL_CHOICES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {viewMode === "scatter" && (
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
        )}

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

        {viewMode === "compare" && (
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
        )}

        <button style={styles.button} onClick={handleCompute}>
          Compute
        </button>
      </div>

      <div style={styles.plotWrap}>
        {viewMode === "scatter" ? (
          scatterTraces.length === 0 ? (
            <div style={styles.empty}>
              {noBrainKeys ? (
                <>
                  <p>No trajectory yet — pick a model and click Compute.</p>
                  <p style={styles.hint}>
                    Compute runs as a delegated operator; on a large dataset it
                    can take a few minutes.
                  </p>
                </>
              ) : !currentSampleId ? (
                <p>Open a video sample in the modal to see its trajectory.</p>
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
        ) : compareTracesAndDomain.traces.length === 0 ? (
          <div style={styles.empty}>
            {noBrainKeys ? (
              <p>Compute at least one brain key first.</p>
            ) : !keyA && !keyB ? (
              <p>Pick brain keys for Model A and Model B.</p>
            ) : !currentSampleId ? (
              <p>Open a video sample in the modal.</p>
            ) : (
              <p>Loading compare data…</p>
            )}
          </div>
        ) : (
          <Plot
            data={compareTracesAndDomain.traces as any}
            layout={
              compareLayout(compareTracesAndDomain.domain, currentFrame) as any
            }
            config={trajectoryConfig as any}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            onClick={handlePlotClick}
          />
        )}
      </div>

      <div style={styles.thumbsArea}>
        {viewMode === "scatter" ? (
          scene && scatterJumps.length > 0 ? (
            <JumpFrames
              title="jump frames"
              frames={scatterJumps}
              media={frameMedia}
              onClickFrame={seekFrame}
            />
          ) : null
        ) : keyA || keyB ? (
          <div style={styles.diffRow}>
            {keyA ? (
              <div style={styles.diffCol}>
                <JumpFrames
                  title={`only ${keyA}`}
                  frames={compareDiff.onlyA}
                  media={frameMedia}
                  onClickFrame={seekFrame}
                />
              </div>
            ) : null}
            <div style={styles.diffCol}>
              <JumpFrames
                title="both"
                frames={compareDiff.both}
                media={frameMedia}
                onClickFrame={seekFrame}
              />
            </div>
            {keyB ? (
              <div style={styles.diffCol}>
                <JumpFrames
                  title={`only ${keyB}`}
                  frames={compareDiff.onlyB}
                  media={frameMedia}
                  onClickFrame={seekFrame}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

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
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(120,120,140,0.18)",
    alignItems: "flex-end",
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
    overflowX: "hidden",
  },
  diffRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
  },
  diffCol: {
    minWidth: 0,
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
  hint: {
    color: "rgba(140,140,160,0.7)",
    fontSize: 11,
    maxWidth: 360,
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
