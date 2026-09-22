import { act, renderHook } from "@testing-library/react";
import React from "react";
import {
  ReverbRoot,
  useReverbState,
  useResetReverbState,
} from "@fiftyone/reverb";

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
    <ReverbRoot
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
    </ReverbRoot>
  );
};

describe("useResetExcludedFieldStage ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should reset excludedFieldsStageState field_names correctly", async () => {
    const { result } = renderHook(
      () => {
        const [excludedFieldsStage, setExcludedFieldsStage] = useReverbState(
          fos.excludedPathsState({}),
        );
        const resetExcludedPaths = useResetReverbState(
          fos.excludedPathsState({}),
        );

        return {
          excludedFieldsStage,
          setExcludedFieldsStage,
          resetExcludedPaths,
        };
      },
      {
        wrapper: Root,
      },
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
