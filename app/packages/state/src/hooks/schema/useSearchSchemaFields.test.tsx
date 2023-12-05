import { act, renderHook } from "@testing-library/react-hooks";
import React from "react";
import { RecoilRoot, useRecoilState, useResetRecoilState } from "recoil";

import * as fos from "@fiftyone/state";
import { RelayEnvironmentProvider } from "react-relay";
import { Environment } from "relay-runtime";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FIELDS } from "../useSchemaSettings.utils.test";

const TEST_DS = {
  name: "test-dataset",
  mediaType: "image",
};

const Root: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <RecoilRoot
      initializeState={({ set }) => {
        set(fos.dataset, TEST_DS);
        set(fos.showNestedFieldsState, false);
        set(fos.excludedPathsState({}), {
          [TEST_DS.name]: [FIELDS.METADATA_FIELD.path],
        });
      }}
    >
      <RelayEnvironmentProvider environment={new Environment({})}>
        {children}
      </RelayEnvironmentProvider>
    </RecoilRoot>
  );
};

describe("useResetExcludedFieldStage ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should reset excludedFieldsStageState field_names correctly", async () => {
    const { result } = renderHook(
      () => {
        const [excludedFieldsStage, setExcludedFieldsStage] = useRecoilState(
          fos.excludedPathsState({})
        );
        const resetExcludedPaths = useResetRecoilState(
          fos.excludedPathsState({})
        );

        return {
          excludedFieldsStage,
          setExcludedFieldsStage,
          resetExcludedPaths,
        };
      },
      {
        wrapper: Root,
      }
    );

    expect(result.current.excludedFieldsStage).toStrictEqual({
      [TEST_DS.name]: [FIELDS.METADATA_FIELD.path],
    });

    act(() => {
      result.current.resetExcludedPaths();
    });

    expect(result.current.excludedFieldsStage[TEST_DS.name].size).toEqual(0);
  });
});
