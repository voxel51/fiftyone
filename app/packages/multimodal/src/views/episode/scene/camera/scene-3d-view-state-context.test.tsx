import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useEffect, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetScene3dViewStateScopesForTests,
  Scene3dViewStateProvider,
  useScene3dViewStateStore,
} from "./scene-3d-view-state-context";

afterEach(() => {
  cleanup();
  __resetScene3dViewStateScopesForTests();
});

describe("Scene3dViewStateProvider inspection scopes", () => {
  it("restores view state after the modal provider unmounts and reopens", () => {
    const firstModal = renderScopedStore("dataset-a:filepath");
    act(() => {
      firstModal.result.current.recordCameraView({
        pose: { position: [1, 2, 3], target: [4, 5, 6] },
        sourceKey: "source-a",
        worldFrameId: "map",
      });
      firstModal.result.current.recordTrackingMode("heading");
    });
    firstModal.unmount();

    const reopenedModal = renderScopedStore("dataset-a:filepath");
    expect(reopenedModal.result.current.getSnapshot()).toEqual(
      expect.objectContaining({
        cameraView: {
          pose: { position: [1, 2, 3], target: [4, 5, 6] },
          sourceKey: "source-a",
          worldFrameId: "map",
        },
        trackingMode: "heading",
      }),
    );
  });

  it("isolates view state between dataset and media-field scopes", () => {
    const filepathModal = renderScopedStore("dataset-a:filepath");
    act(() => filepathModal.result.current.recordTrackingMode("free"));
    filepathModal.unmount();

    const alternateFieldModal = renderScopedStore("dataset-a:alternate");
    expect(alternateFieldModal.result.current.getSnapshot().trackingMode).toBe(
      null,
    );

    const otherDatasetModal = renderScopedStore("dataset-b:filepath");
    expect(otherDatasetModal.result.current.getSnapshot().trackingMode).toBe(
      null,
    );
  });

  it("bounds inactive inspection scopes", () => {
    const firstModal = renderScopedStore("scope-0");
    act(() => firstModal.result.current.recordTrackingMode("pose"));
    firstModal.unmount();

    for (let index = 1; index <= 32; index += 1) {
      renderScopedStore(`scope-${index}`).unmount();
    }

    const evictedModal = renderScopedStore("scope-0");
    expect(evictedModal.result.current.getSnapshot().trackingMode).toBeNull();
  });

  it("retains a newly mounted scope when every cached scope is active", () => {
    const mounted = Array.from({ length: 32 }, (_, index) =>
      renderScopedStore(`active-${index}`),
    );
    const newest = renderScopedStore("newest");
    act(() => newest.result.current.recordTrackingMode("heading"));

    mounted[0].unmount();
    newest.unmount();

    const reopened = renderScopedStore("newest");
    expect(reopened.result.current.getSnapshot().trackingMode).toBe("heading");
  });

  it("retains 33 scopes mounted in one commit before evicting", () => {
    const stores = new Map<
      string,
      ReturnType<typeof useScene3dViewStateStore>
    >();
    const { rerender, unmount } = render(
      <ScopedStoreGroup count={33} stores={stores} />,
    );
    const firstStore = stores.get("scope-0");
    expect(firstStore).toBeDefined();
    act(() => firstStore?.recordTrackingMode("heading"));

    rerender(<ScopedStoreGroup count={32} stores={stores} />);
    unmount();

    const reopened = renderScopedStore("scope-0");
    expect(reopened.result.current.getSnapshot().trackingMode).toBe("heading");
  });

  it("does not reuse a reconciled store after its scope is recreated", () => {
    const stores = new Map<
      string,
      ReturnType<typeof useScene3dViewStateStore>
    >();
    const { rerender } = render(
      <ReconciledStoreHarness
        includePrimary
        subjectScope="shared"
        fillerCount={0}
        stores={stores}
      />,
    );
    expect(stores.get("subject")).toBe(stores.get("primary"));
    act(() => stores.get("subject")?.recordTrackingMode("heading"));

    rerender(
      <ReconciledStoreHarness
        includePrimary={false}
        subjectScope="parking"
        fillerCount={0}
        stores={stores}
      />,
    );
    rerender(
      <ReconciledStoreHarness
        includePrimary={false}
        subjectScope="parking"
        fillerCount={31}
        stores={stores}
      />,
    );
    rerender(
      <ReconciledStoreHarness
        includePrimary={false}
        subjectScope="shared"
        fillerCount={31}
        stores={stores}
      />,
    );

    expect(stores.get("subject")?.getSnapshot().trackingMode).toBeNull();
  });
});

function ScopedStoreGroup({
  count,
  stores,
}: {
  readonly count: number;
  readonly stores: Map<string, ReturnType<typeof useScene3dViewStateStore>>;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const scopeKey = `scope-${index}`;
        return (
          <Scene3dViewStateProvider key={scopeKey} scopeKey={scopeKey}>
            <StoreCapture captureKey={scopeKey} stores={stores} />
          </Scene3dViewStateProvider>
        );
      })}
    </>
  );
}

function ReconciledStoreHarness({
  fillerCount,
  includePrimary,
  stores,
  subjectScope,
}: {
  readonly fillerCount: number;
  readonly includePrimary: boolean;
  readonly stores: Map<string, ReturnType<typeof useScene3dViewStateStore>>;
  readonly subjectScope: string;
}) {
  return (
    <>
      {includePrimary ? (
        <Scene3dViewStateProvider scopeKey="shared">
          <StoreCapture captureKey="primary" stores={stores} />
        </Scene3dViewStateProvider>
      ) : null}
      <Scene3dViewStateProvider scopeKey={subjectScope}>
        <StoreCapture captureKey="subject" stores={stores} />
      </Scene3dViewStateProvider>
      {Array.from({ length: fillerCount }, (_, index) => {
        const scopeKey = `filler-${index}`;
        return (
          <Scene3dViewStateProvider key={scopeKey} scopeKey={scopeKey}>
            <StoreCapture captureKey={scopeKey} stores={stores} />
          </Scene3dViewStateProvider>
        );
      })}
    </>
  );
}

function StoreCapture({
  captureKey,
  stores,
}: {
  readonly captureKey: string;
  readonly stores: Map<string, ReturnType<typeof useScene3dViewStateStore>>;
}) {
  const store = useScene3dViewStateStore();
  // This effect exposes the committed scoped store to the regression test.
  useEffect(() => {
    stores.set(captureKey, store);
  }, [captureKey, store, stores]);
  return null;
}

function renderScopedStore(scopeKey: string) {
  return renderHook(useScene3dViewStateStore, {
    wrapper: ({ children }: PropsWithChildren) => (
      <Scene3dViewStateProvider scopeKey={scopeKey}>
        {children}
      </Scene3dViewStateProvider>
    ),
  });
}
