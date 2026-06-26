import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useSetRecoilState } from "recoil";
import {
  DEFAULT_FO3D_PERFORMANCE_STATS,
  fo3dPerformanceStatsAtom,
  type Fo3dPerformanceStats,
} from "../state";

const PERFORMANCE_SAMPLE_INTERVAL_MS = 500;

const hasPerformanceStatsChanged = (
  previous: Fo3dPerformanceStats,
  next: Fo3dPerformanceStats,
) => {
  return (
    previous.fps !== next.fps ||
    previous.calls !== next.calls ||
    previous.triangles !== next.triangles ||
    previous.points !== next.points ||
    previous.geometries !== next.geometries ||
    previous.textures !== next.textures ||
    previous.programs !== next.programs
  );
};

export const Fo3dPerformanceMonitor = () => {
  const setPerformanceStats = useSetRecoilState(fo3dPerformanceStatsAtom);
  const sampleRef = useRef<{ frames: number; startedAtMs: number | null }>({
    frames: 0,
    startedAtMs: null,
  });

  useEffect(() => {
    return () => {
      setPerformanceStats(DEFAULT_FO3D_PERFORMANCE_STATS);
    };
  }, [setPerformanceStats]);

  useFrame(({ clock, gl }) => {
    const nowMs = clock.elapsedTime * 1000;
    const sample = sampleRef.current;

    if (sample.startedAtMs === null) {
      sample.startedAtMs = nowMs;
    }

    sample.frames += 1;

    const elapsedMs = nowMs - sample.startedAtMs;
    if (elapsedMs < PERFORMANCE_SAMPLE_INTERVAL_MS) {
      return;
    }

    const nextStats: Fo3dPerformanceStats = {
      fps: (sample.frames * 1000) / elapsedMs,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      points: gl.info.render.points,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
    };

    setPerformanceStats((previous) =>
      hasPerformanceStatsChanged(previous, nextStats) ? nextStats : previous,
    );

    sampleRef.current = {
      frames: 0,
      startedAtMs: nowMs,
    };
  });

  return null;
};
