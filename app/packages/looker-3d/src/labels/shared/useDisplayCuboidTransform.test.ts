import { renderHook } from "@testing-library/react-hooks";
import React from "react";
import { RecoilRoot } from "recoil";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { transformModeAtom } from "../../state";
import { useDisplayCuboidTransform } from "./useDisplayCuboidTransform";

const { useTransientCuboidMock } = vi.hoisted(() => ({
  useTransientCuboidMock: vi.fn(),
}));

vi.mock("../../annotation/store", () => ({
  useTransientCuboid: useTransientCuboidMock,
}));

// The state barrel reaches `@fiftyone/state` and its Relay fragments, which
// need the Relay Babel transform that vitest doesn't run — importing it threw at
// load time, so this file never executed. Stand in a real atom (the test drives
// it through RecoilRoot) without pulling the barrel in.
vi.mock("../../state", async () => {
  const { atom } = await import("recoil");
  return {
    transformModeAtom: atom({
      key: "test-transformMode",
      default: "scale",
    }),
  };
});

function renderWithMode(
  transformMode: "scale" | "rotate" | "translate",
  args: Parameters<typeof useDisplayCuboidTransform>[0],
) {
  const wrapper = ({ children }: { children?: React.ReactNode }) =>
    // `children` goes in the props object: RecoilRootProps requires it, and the
    // third-argument form doesn't satisfy that overload.
    React.createElement(RecoilRoot, {
      initializeState: ({ set }) => set(transformModeAtom, transformMode),
      children,
    });
  return renderHook(() => useDisplayCuboidTransform(args), { wrapper });
}

describe("useDisplayCuboidTransform", () => {
  it("uses the effective dimensions/location unchanged with no transient state", () => {
    useTransientCuboidMock.mockReturnValue(undefined);

    const { result } = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [1, 2, 3],
      effectiveDimensions: [4, 5, 6],
      effectiveRotation: [0, 0, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: false,
    });

    expect(result.current.displayDimensions).toEqual([4, 5, 6]);
    expect(result.current.displayPosition).toEqual([1, 2, 3]);
  });

  it("applies the legacy-coordinate half-height Y offset", () => {
    useTransientCuboidMock.mockReturnValue(undefined);

    const { result } = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [1, 10, 3],
      effectiveDimensions: [4, 6, 8],
      effectiveRotation: [0, 0, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: true,
    });

    expect(result.current.displayPosition).toEqual([1, 7, 3]);
  });

  it("applies transient dimensions/position deltas", () => {
    useTransientCuboidMock.mockReturnValue({
      dimensionsDelta: [1, 1, 1],
      positionDelta: [10, 20, 30],
    });

    const { result } = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [1, 2, 3],
      effectiveDimensions: [4, 5, 6],
      effectiveRotation: [0, 0, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: false,
    });

    expect(result.current.displayDimensions).toEqual([5, 6, 7]);
    expect(result.current.displayPosition).toEqual([11, 22, 33]);
  });

  it("prefers the transient quaternion override only while actively rotating", () => {
    const transientQuaternion = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0.1, 0.2, 0.3))
      .toArray() as [number, number, number, number];
    useTransientCuboidMock.mockReturnValue({
      quaternionOverride: transientQuaternion,
    });

    const rotating = renderWithMode("rotate", {
      labelId: "label-1",
      effectiveLocation: [0, 0, 0],
      effectiveDimensions: [1, 1, 1],
      effectiveRotation: [0, 0, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: false,
    });
    expect(rotating.result.current.combinedQuaternion?.toArray()).toEqual(
      transientQuaternion,
    );

    const notRotating = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [0, 0, 0],
      effectiveDimensions: [1, 1, 1],
      effectiveRotation: [0, 0, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: false,
    });
    // Not rotating, and no effectiveQuaternion, so it falls back to null
    // (euler fallback territory), ignoring the transient override.
    expect(notRotating.result.current.combinedQuaternion).toBeNull();
  });

  it("uses effectiveQuaternion (working store) over the euler fallback", () => {
    useTransientCuboidMock.mockReturnValue(undefined);
    const workingQuaternion: [number, number, number, number] = [0, 0, 0, 1];

    const { result } = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [0, 0, 0],
      effectiveDimensions: [1, 1, 1],
      effectiveRotation: [1, 1, 1],
      effectiveQuaternion: workingQuaternion,
      useLegacyCoordinates: false,
    });

    expect(result.current.combinedQuaternion?.toArray()).toEqual(
      workingQuaternion,
    );
    expect(result.current.fallbackEuler).toBeUndefined();
  });

  it("falls back to a euler rotation when no quaternion is available", () => {
    useTransientCuboidMock.mockReturnValue(undefined);

    const { result } = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [0, 0, 0],
      effectiveDimensions: [1, 1, 1],
      effectiveRotation: [0, Math.PI / 2, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: false,
    });

    expect(result.current.combinedQuaternion).toBeNull();
    expect(result.current.fallbackEuler?.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it("always produces a non-null orientationQuaternion, even without a combined quaternion", () => {
    useTransientCuboidMock.mockReturnValue(undefined);

    const { result } = renderWithMode("scale", {
      labelId: "label-1",
      effectiveLocation: [0, 0, 0],
      effectiveDimensions: [4, 2, 2],
      effectiveRotation: [0, 0, 0],
      effectiveQuaternion: null,
      useLegacyCoordinates: false,
    });

    expect(result.current.orientationQuaternion).toBeInstanceOf(
      THREE.Quaternion,
    );
  });
});
