import React, { Suspense, useCallback, useMemo } from "react";
import Plot from "react-plotly.js";
import { usePanelContext, usePanelStatePartial } from "@fiftyone/spaces";

import { useTrajectoryData } from "../hooks/useTrajectoryData";
import { useFrameSync } from "../hooks/useFrameSync";
import { useCompareData } from "../hooks/useCompareData";
import {
  buildTraces,
  defaultJumpThreshold,
  findCursorIndex,
} from "../plot/buildTraces";
import { buildCompareTraces, compareLayout } from "../plot/buildCompareTraces";
import { trajectoryConfig, trajectoryLayout } from "../plot/trajectoryLayout";
import type { TrajectoryViewProps, ViewMode } from "../types";

const TRAJECTORY_LENGTH_DEFAULT = 30;
const JUMP_SIGMA_DEFAULT = 2;
const MODEL_CHOICES: Array<{ value: string; label: string }> = [
  { value: "clip-vit-base32-torch", label: "CLIP ViT-B/32 (semantic)" },
  { value: "dinov2-vitb14-torch", label: "DINOv2 ViT-B/14 (visual)" },
];

function TemporalEmbeddingTrajectoryReady(props: TrajectoryViewProps) {
  const [viewMode, setViewMode] = usePanelStatePartial<ViewMode>(
    "viewMode",
    "scatter",
    true
  );
  const [selectedBrainKey, setSelectedBrainKey] = usePanelStatePartial<
    string | null
  >("selectedBrainKey", null, true);
  const [compareKeys, setCompareKeys] = usePanelStatePartial<string[]>(
    "compareKeys",
    [],
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

  // Seed compareKeys with the currently-selected brain key the first time
  // the user has a key available, so the compare view isn't empty on first
  // open.
  React.useEffect(() => {
    if (
      (compareKeys?.length ?? 0) === 0 &&
      brainKeys.length > 0 &&
      selectedBrainKey
    ) {
      setCompareKeys([selectedBrainKey]);
    }
  }, [compareKeys, brainKeys, selectedBrainKey, setCompareKeys]);

  const { scenes: compareScenes } = useCompareData(
    props,
    currentSampleId,
    viewMode === "compare" ? compareKeys ?? [] : []
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

  // ── Compare mode derived state ─────────────────────────────────────
  const compareTracesAndDomain = useMemo(() => {
    const orderedKeys = (compareKeys ?? []).filter((k) => compareScenes[k]);
    const scenesList = orderedKeys.map((k) => ({
      brainKey: k,
      scene: compareScenes[k],
    }));
    return buildCompareTraces({
      scenes: scenesList,
      jumpSigma: jumpSigma ?? JUMP_SIGMA_DEFAULT,
      currentFrameNumber: currentFrame,
    });
  }, [compareKeys, compareScenes, jumpSigma, currentFrame]);

  const handlePlotClick = useCallback(
    (event: any) => {
      const pt = event?.points?.[0];
      if (!pt) return;
      // customdata varies per trace:
      //   scatter mode: frame_number (number) or [frame_number, jump_dist]
      //   compare mode: [brain_key, frame_number, jump_dist]
      let frameNumber: number | undefined;
      const cd = pt.customdata;
      if (Array.isArray(cd)) {
        // last numeric in [brainKey, frame_number, jump_dist] is jump_dist —
        // frame_number is the second element when string is present, first otherwise.
        frameNumber = typeof cd[0] === "string" ? Number(cd[1]) : Number(cd[0]);
      } else if (cd != null) {
        frameNumber = Number(cd);
      }
      if (frameNumber == null || Number.isNaN(frameNumber)) return;

      seekFrame(frameNumber);

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

  const toggleCompareKey = useCallback(
    (key: string) => {
      const current = compareKeys ?? [];
      if (current.includes(key)) {
        setCompareKeys(current.filter((k) => k !== key));
      } else {
        setCompareKeys([...current, key]);
      }
    },
    [compareKeys, setCompareKeys]
  );

  const noBrainKeys = brainKeys.length === 0;
  const cursorIdx = scene
    ? findCursorIndex(scene.frame_numbers, currentFrame)
    : -1;

  // Status counts depend on the active mode.
  const statusLeft = (() => {
    if (viewMode === "scatter") {
      return scene
        ? `${scene.points.length} frames · ${
            scene.jump_dists.filter((d) => d >= jumpThreshold).length
          } jumps`
        : "no scene loaded";
    }
    const keys = compareKeys ?? [];
    const loaded = keys.filter((k) => compareScenes[k]).length;
    return `${loaded}/${keys.length} keys loaded`;
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
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Compare brain keys</span>
            <div style={styles.compareKeyList}>
              {noBrainKeys ? (
                <span style={styles.hint}>compute first</span>
              ) : (
                brainKeys.map((bk) => {
                  const checked = (compareKeys ?? []).includes(bk.key);
                  return (
                    <label key={bk.key} style={styles.compareKeyItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompareKey(bk.key)}
                      />
                      <span>{bk.key}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
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
            ) : (compareKeys ?? []).length === 0 ? (
              <p>Pick one or more brain keys to compare.</p>
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
  compareKeyList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    background: "rgba(40,40,55,0.5)",
    border: "1px solid rgba(120,120,150,0.25)",
    borderRadius: 4,
    padding: "4px 6px",
    maxHeight: 92,
    overflowY: "auto",
    minWidth: 200,
  },
  compareKeyItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
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
