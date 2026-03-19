import { act, renderHook } from "@testing-library/react-hooks";
import { Box3, Group } from "three";
import { afterEach, describe, expect, it, Mock, vi } from "vitest";
import { useFo3dBounds } from "./use-bounds";

vi.useFakeTimers();

vi.mock("three", () => {
  return {
    Box3: vi.fn(),
    Vector3: vi.fn(),
  };
});

describe("useFo3dBounds", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.resetAllMocks();
  });

  it("returns null when objectRef.current is null", () => {
    const objectRef = { current: null } as React.RefObject<Group>;

    const { result } = renderHook(() => useFo3dBounds(objectRef));

    expect(result.current.boundingBox).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The hook should return null when objectRef.current is null
    expect(result.current.boundingBox).toBeNull();
  });

  it("sets bounding box when bounding box stabilizes", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    // Mock Box3 to return unstable boxes initially, then stabilize
    let callCount = 0;
    const MockBox3 = vi.fn().mockImplementation(() => {
      callCount++;
      // Return different boxes for the first 3 calls (unstable)
      // Then return a consistent stable box (calls 4+)
      if (callCount <= 3) {
        return {
          min: { x: callCount * 0.1, y: callCount * 0.1, z: callCount * 0.1 },
          max: {
            x: 1 + callCount * 0.1,
            y: 1 + callCount * 0.1,
            z: 1 + callCount * 0.1,
          },
          setFromObject: vi.fn().mockReturnThis(),
        };
      }
      return {
        min: { x: 0.5, y: 0.5, z: 0.5 },
        max: { x: 1.5, y: 1.5, z: 1.5 },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    const { result, unmount } = renderHook(() => useFo3dBounds(objectRef));

    // Initially, boundingBox should be null
    expect(result.current.boundingBox).toBeNull();

    // Advance time to allow the box to stabilize
    act(() => {
      vi.runAllTimers();
    });

    // After stabilization, bounding box should be set to the stable values
    expect(result.current.boundingBox).not.toBeNull();
    expect(result.current.boundingBox?.min.x).toBe(0.5);
    expect(result.current.boundingBox?.min.y).toBe(0.5);
    expect(result.current.boundingBox?.min.z).toBe(0.5);
    expect(result.current.boundingBox?.max.x).toBe(1.5);
    expect(result.current.boundingBox?.max.y).toBe(1.5);
    expect(result.current.boundingBox?.max.z).toBe(1.5);

    unmount();
  });

  it("returns null when bounds are incomputable (non-finite box)", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    // Mock Box3 to return a box with non-finite values
    const MockBox3 = vi.fn().mockImplementation(() => {
      return {
        min: { x: Infinity, y: 0, z: 0, equals: vi.fn(() => true) },
        max: { x: 1, y: 1, z: 1, equals: vi.fn(() => true) },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    const { result } = renderHook(() => useFo3dBounds(objectRef));

    expect(result.current.boundingBox).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The hook should return null when bounds are incomputable
    expect(result.current.boundingBox).toBeNull();
  });

  it("waits for isReady before computing bounds", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    // Mock Box3 to return a valid stable box
    const MockBox3 = vi.fn().mockImplementation(() => {
      return {
        min: { x: 0, y: 0, z: 0, equals: vi.fn(() => true) },
        max: { x: 1, y: 1, z: 1, equals: vi.fn(() => true) },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    // Initially not ready
    const { result, rerender } = renderHook(
      ({ isReady }: { isReady: boolean }) => useFo3dBounds(objectRef, isReady),
      { initialProps: { isReady: false } }
    );

    expect(result.current.boundingBox).toBeNull();

    // Still not computing since isReady is false
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.boundingBox).toBeNull();

    // Now mark as ready
    rerender({ isReady: true });

    // Advance time to allow stabilization
    act(() => {
      vi.runAllTimers();
    });

    // After isReady becomes true and stabilization, bounding box should be computed
    expect(result.current.boundingBox).not.toBeNull();
  });

  it("tracks isComputing state during computation", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    // Mock Box3 to return a stable box after multiple calls
    let callCount = 0;
    const MockBox3 = vi.fn().mockImplementation(() => {
      callCount++;
      return {
        min: { x: 0.5, y: 0.5, z: 0.5 },
        max: { x: 1.5, y: 1.5, z: 1.5 },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    const { result, unmount } = renderHook(() => useFo3dBounds(objectRef));

    // Should be computing initially
    expect(result.current.isComputing).toBe(true);

    // After stabilization, should no longer be computing
    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.isComputing).toBe(false);
    expect(result.current.boundingBox).not.toBeNull();

    unmount();
  });

  it("allows recomputing bounds via recomputeBounds callback", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    let computeCallCount = 0;
    let computeCycleCount = 0; // Track which computation cycle we're in
    const MockBox3 = vi.fn().mockImplementation(() => {
      computeCallCount++;
      // Return different boxes based on compute cycle
      // Cycle 1: small values, Cycle 2: large values
      const isSecondCycle = computeCallCount > 3;
      const scale = isSecondCycle ? 10 : 1;
      return {
        min: { x: scale * 0.5, y: scale * 0.5, z: scale * 0.5 },
        max: { x: scale * 1.5, y: scale * 1.5, z: scale * 1.5 },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    const { result, unmount } = renderHook(() => useFo3dBounds(objectRef));

    // Wait for initial computation
    act(() => {
      vi.runAllTimers();
    });

    const firstBoundingBox = result.current.boundingBox;
    expect(firstBoundingBox?.min.x).toBe(0.5); // First cycle, small values

    // Trigger recomputation
    act(() => {
      result.current.recomputeBounds();
    });

    // Wait for new computation
    act(() => {
      vi.runAllTimers();
    });

    // Should have new bounding box from second cycle with larger values
    expect(result.current.boundingBox).not.toBeNull();
    expect(result.current.boundingBox?.min.x).toBe(5); // 10 * 0.5 from second cycle
    expect(result.current.boundingBox?.max.x).toBe(15); // 10 * 1.5 from second cycle

    unmount();
  });

  it("respects custom stableSamples option", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    let computeCount = 0;
    const MockBox3 = vi.fn().mockImplementation(() => {
      computeCount++;
      return {
        min: { x: 0.5, y: 0.5, z: 0.5 },
        max: { x: 1.5, y: 1.5, z: 1.5 },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    // With stableSamples=1, should stabilize after just 1 consistent box
    const { result, unmount } = renderHook(() =>
      useFo3dBounds(objectRef, undefined, { stableSamples: 1 })
    );

    expect(result.current.boundingBox).toBeNull();

    act(() => {
      vi.runAllTimers();
    });

    // Should have computed quickly with just 1 sample needed
    expect(result.current.boundingBox).not.toBeNull();
    expect(computeCount).toBeLessThan(5); // Should need fewer calls than default (3 samples)

    unmount();
  });

  it("respects custom epsilon tolerance for box equality", () => {
    const objectRef = {
      current: {
        updateWorldMatrix: vi.fn(),
      },
    } as unknown as React.RefObject<Group>;

    let callCount = 0;
    // Create boxes that are slightly different but within epsilon tolerance
    const MockBox3 = vi.fn().mockImplementation(() => {
      callCount++;
      const baseMin = 0.5;
      const baseMax = 1.5;
      // Add tiny variations within 0.001 epsilon
      const variation = callCount === 1 ? 0.0001 : 0.0003;
      return {
        min: {
          x: baseMin + variation,
          y: baseMin + variation,
          z: baseMin + variation,
        },
        max: {
          x: baseMax + variation,
          y: baseMax + variation,
          z: baseMax + variation,
        },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    // Use looser epsilon tolerance (0.001) so boxes are considered equal
    const { result, unmount } = renderHook(() =>
      useFo3dBounds(objectRef, undefined, { stableSamples: 3, epsilon: 0.001 })
    );

    act(() => {
      vi.runAllTimers();
    });

    // Should stabilize because boxes are within epsilon tolerance
    expect(result.current.boundingBox).not.toBeNull();

    unmount();
  });
});
