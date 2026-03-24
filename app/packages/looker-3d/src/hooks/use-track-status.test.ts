import { act, renderHook } from "@testing-library/react-hooks";
import { LoadingManager } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingStatus } from "../types";
import { useTrackStatus } from "./use-track-status";

const mockAtoms = vi.hoisted(() => ({
  fo3dAssetsParseStatusThisSample: { key: "fo3dAssetsParseStatusThisSample" },
  fo3dLoadingStatusThisSample: { key: "fo3dLoadingStatusThisSample" },
}));

const store = vi.hoisted(() => ({
  logs: [] as { message: string; status: "info" | "success" | "error" }[],
  loadingStatus: {
    status: "idle",
    timestamp: 0,
  } as {
    status: string;
    currentUrl?: string;
    itemsLoaded?: number;
    itemsTotal?: number;
    progress?: number;
    timestamp?: number;
  },
}));

vi.mock("../state", () => mockAtoms);

vi.mock("./use-loading-status", () => ({
  useLoadingStatus: () => ({
    ...store.loadingStatus,
    isLoading:
      store.loadingStatus.status === LoadingStatus.STARTED ||
      store.loadingStatus.status === LoadingStatus.LOADING,
    isSuccess: store.loadingStatus.status === LoadingStatus.SUCCESS,
    isFailed: store.loadingStatus.status === LoadingStatus.FAILED,
    isIdle: store.loadingStatus.status === LoadingStatus.IDLE,
    isAborted: false,
    fullStatus: store.loadingStatus,
  }),
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  const setLogs = (value: unknown) => {
    store.logs =
      value instanceof Function
        ? value(store.logs)
        : (value as typeof store.logs);
  };

  const setLoadingStatus = (value: unknown) => {
    store.loadingStatus =
      value instanceof Function
        ? value(store.loadingStatus)
        : (value as typeof store.loadingStatus);
  };

  return {
    ...actual,
    useSetRecoilState: (atom: { key: string }) => {
      if (atom.key === mockAtoms.fo3dAssetsParseStatusThisSample.key) {
        return setLogs;
      }

      throw new Error(`Unexpected recoil atom: ${atom.key}`);
    },
    useRecoilState: (atom: { key: string }) => {
      if (atom.key === mockAtoms.fo3dLoadingStatusThisSample.key) {
        return [store.loadingStatus, setLoadingStatus];
      }

      throw new Error(`Unexpected recoil atom: ${atom.key}`);
    },
  };
});

describe("useTrackStatus", () => {
  beforeEach(() => {
    store.logs = [{ message: "stale", status: "error" }];
    store.loadingStatus = {
      status: "failed",
      currentUrl: "/stale.fo3d",
      timestamp: 1,
    };
  });

  it("resets the current scene state and detaches the previous manager", async () => {
    const managerA = new LoadingManager();
    const managerB = new LoadingManager();

    const { rerender } = renderHook(
      ({ manager }: { manager: LoadingManager }) => useTrackStatus(manager),
      {
        initialProps: { manager: managerA },
      }
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(store.logs).toEqual([]);
    expect(store.loadingStatus.status).toBe(LoadingStatus.IDLE);

    rerender({ manager: managerB });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      managerA.onError("/late-from-old-sample.fo3d");
      await Promise.resolve();
    });

    expect(store.logs).toEqual([]);
    expect(store.loadingStatus.status).toBe(LoadingStatus.IDLE);

    await act(async () => {
      managerB.onStart("/current.fo3d", 1, 2);
      await Promise.resolve();
    });

    expect(store.loadingStatus).toMatchObject({
      status: LoadingStatus.STARTED,
      currentUrl: "/current.fo3d",
      itemsLoaded: 1,
      itemsTotal: 2,
    });
  });

  it("ignores queued updates from a manager after it is replaced", async () => {
    const managerA = new LoadingManager();
    const managerB = new LoadingManager();

    const { rerender } = renderHook(
      ({ manager }: { manager: LoadingManager }) => useTrackStatus(manager),
      {
        initialProps: { manager: managerA },
      }
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      managerA.onStart("/stale.fo3d", 1, 1);
      rerender({ manager: managerB });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(store.logs).toEqual([]);
    expect(store.loadingStatus.status).toBe(LoadingStatus.IDLE);
  });

  it("marks idle scenes as successful once the current scene is ready", async () => {
    const manager = new LoadingManager();

    const { rerender } = renderHook(
      ({
        currentManager,
        isSceneReady,
      }: {
        currentManager: LoadingManager;
        isSceneReady: boolean;
      }) => useTrackStatus(currentManager, isSceneReady),
      {
        initialProps: { currentManager: manager, isSceneReady: false },
      }
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(store.loadingStatus.status).toBe(LoadingStatus.IDLE);

    rerender({ currentManager: manager, isSceneReady: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(store.loadingStatus).toMatchObject({
      status: LoadingStatus.SUCCESS,
      progress: 100,
    });
  });
});
