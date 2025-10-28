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
    const objectRef = { current: {} } as React.RefObject<Group>;

    let callCount = 0;

    // mock Box3 to return changing boxes initially,
    // then stable boxes
    const boxes = [
      // changing boxes
      {
        min: { x: 0, y: 0, z: 0, equals: vi.fn(() => false) },
        max: { x: 1, y: 1, z: 1, equals: vi.fn(() => false) },
      },
      // stable boxes
      {
        min: { x: 0.5, y: 0.5, z: 0.5, equals: vi.fn(() => true) },
        max: { x: 1.5, y: 1.5, z: 1.5, equals: vi.fn(() => true) },
      },
    ];

    const MockBox3 = vi.fn().mockImplementation(() => {
      const box = boxes[callCount < 5 ? 0 : 1];
      callCount++;
      return {
        min: box.min,
        max: box.max,
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    // set the implementation of the mocked Box3
    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    const { result } = renderHook(() => useFo3dBounds(objectRef));

    expect(result.current.boundingBox).toBeNull();

    act(() => {
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(50);
      }
    });

    expect(result.current.boundingBox).not.toBeNull();
    expect(result.current.boundingBox.min).toEqual(boxes[1].min);
    expect(result.current.boundingBox.max).toEqual(boxes[1].max);
  });

  it("returns null when bounds are incomputable (non-finite box)", () => {
    const objectRef = { current: {} } as React.RefObject<Group>;

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

  it("waits for predicate before computing bounds", () => {
    const objectRef = { current: {} } as React.RefObject<Group>;
    let callCount = 0;
    const predicate = vi.fn(() => {
      callCount++;
      // Return true after 3 calls to simulate a condition becoming ready
      return callCount > 3;
    });

    // Mock Box3 to return a valid stable box
    const MockBox3 = vi.fn().mockImplementation(() => {
      return {
        min: { x: 0, y: 0, z: 0, equals: vi.fn(() => true) },
        max: { x: 1, y: 1, z: 1, equals: vi.fn(() => true) },
        setFromObject: vi.fn().mockReturnThis(),
      };
    });

    (Box3 as unknown as Mock).mockImplementation(MockBox3);

    const { result } = renderHook(() => useFo3dBounds(objectRef, predicate));

    expect(result.current.boundingBox).toBeNull();
    expect(predicate).toHaveBeenCalled();

    // Advance time to allow predicate to return true
    act(() => {
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(50);
      }
    });

    // After predicate returns true, bounding box should be computed
    expect(callCount).toBeGreaterThan(3);
    expect(result.current.boundingBox).not.toBeNull();
  });
});
