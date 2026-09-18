import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { RecoilRoot, useRecoilCallback } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

// Provide just the @fiftyone/state surface the seam imports.
vi.mock("@fiftyone/state", async () => {
  const { atom, useRecoilValue } =
    await vi.importActual<typeof import("recoil")>("recoil");
  const datasetName = atom<string | null>({
    key: "test_product_datasetName",
    default: null,
  });
  return {
    datasetName,
    useCurrentDatasetName: () => useRecoilValue(datasetName),
  };
});

import { datasetName } from "@fiftyone/state";
import {
  type Product,
  registerProduct,
  resetProductForTests,
  useDatasetDisplayName,
  useProduct,
} from "./product";

const REGISTERED: Product = {
  id: "test:registered",
  title: "A Product",
  enterpriseCta: false,
  useDatasetDisplayName: () => "quickstart (v1)",
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

/** Renders the display name with a dataset loaded. */
const renderDisplayName = (loaded: string) => {
  const { result } = renderHook(
    () => ({
      displayName: useDatasetDisplayName(),
      load: useRecoilCallback(
        ({ set }) =>
          (name: string) => {
            set(datasetName, name);
          },
        [],
      ),
    }),
    { wrapper },
  );
  act(() => result.current.load(loaded));
  return result;
};

afterEach(() => resetProductForTests());

describe("the product seam", () => {
  it("serves the open-source product until one registers", () => {
    const { result } = renderHook(() => useProduct());

    expect(result.current.title).toBe("FiftyOne");
    expect(result.current.enterpriseCta).toBe(true);
    expect(result.current.Status).toBeUndefined();
  });

  it("serves a registered product to what already rendered", () => {
    const { result } = renderHook(() => useProduct());

    act(() => {
      registerProduct(REGISTERED);
    });

    expect(result.current.title).toBe("A Product");
    expect(result.current.enterpriseCta).toBe(false);
  });

  it("restores the open-source product when a registration is withdrawn", () => {
    const { result } = renderHook(() => useProduct());
    let unregister: () => void = () => undefined;
    act(() => {
      unregister = registerProduct(REGISTERED);
    });

    act(() => unregister());

    expect(result.current.title).toBe("FiftyOne");
  });

  it("rejects a second product claiming the slot", () => {
    registerProduct(REGISTERED);

    expect(() =>
      registerProduct({ ...REGISTERED, id: "test:other" }),
    ).toThrowError(/already registered: test:registered/);
  });

  it("replaces a product re-registering its own id", () => {
    registerProduct(REGISTERED);
    const { result } = renderHook(() => useProduct());

    act(() => {
      registerProduct({ ...REGISTERED, title: "Reloaded" });
    });

    expect(result.current.title).toBe("Reloaded");
  });

  it("shows the loaded dataset's own name with no product registered", () => {
    expect(renderDisplayName("quickstart").current.displayName).toBe(
      "quickstart",
    );
  });

  it("shows the name a registered product contributes", () => {
    registerProduct(REGISTERED);

    expect(renderDisplayName("quickstart").current.displayName).toBe(
      "quickstart (v1)",
    );
  });

  it("keeps the hook a mounted field started with", () => {
    const result = renderDisplayName("quickstart");

    // A product registers before the shell's first render; one arriving later
    // must not change how many hooks the field has already run
    act(() => {
      registerProduct(REGISTERED);
    });

    expect(result.current.displayName).toBe("quickstart");
  });
});
