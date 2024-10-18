import { act, renderHook } from "@testing-library/react-hooks";
import { Box3, Group } from "three";
import { afterEach, describe, expect, it, Mock, vi } from "vitest";
import { useFo3dBounds } from "./use-bounds";

vi.useFakeTimers();

vi.mock("three", () => {
  return {
    Box3: vi.fn(),
  };
});

describe("useFo3dBounds", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.resetAllMocks();
  });

  it("does not set bounding box when objectRef.current is null", () => {
    const objectRef = { current: null } as React.RefObject<Group>;

    const { result } = renderHook(() => useFo3dBounds(objectRef));

    expect(result.current).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBeNull();
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

    expect(result.current).toBeNull();

    act(() => {
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(50);
      }
    });

    expect(result.current).not.toBeNull();
    expect(result.current.min).toEqual(boxes[1].min);
    expect(result.current.max).toEqual(boxes[1].max);
  });

  it("does not proceed if predicate returns false", () => {
    const objectRef = { current: {} } as React.RefObject<Group>;
    const predicate = vi.fn(() => false);

    const { result } = renderHook(() => useFo3dBounds(objectRef, predicate));

    expect(result.current).toBeNull();
    expect(predicate).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBeNull();
  });
});
