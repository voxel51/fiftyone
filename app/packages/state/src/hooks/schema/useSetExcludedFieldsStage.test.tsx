import React from "react";
import { renderHook, act } from "@testing-library/react-hooks";
import { RecoilRoot, useRecoilValue } from "recoil";

import { afterEach, describe, expect, test, vi } from "vitest";
import * as fos from "@fiftyone/state";
import { FIELDS } from "../useSchemaSettings.utils.test";
import { RelayEnvironmentProvider } from "react-relay";
import { Environment } from "relay-runtime";

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

describe("useSetShowNestedFields hook used in schema code", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("useSetExcludedFieldsStage should set excludedFieldsState correctly", async () => {
    const stage = {
      _cls: "fiftyone.core.stages.ExcludeFields",
      kwargs: {
        field_names: [FIELDS.METADATA_FIELD.path],
        _allow_missing: true,
      },
    };

    const { result } = renderHook(
      () => {
        const { setFieldVisibilityStage } = fos.useSetSelectedFieldsStage();

        return {
          setFieldVisibilityStage: (stage) => setFieldVisibilityStage(stage),
          excludedFieldsStage: useRecoilValue(fos.excludedPathsState({})),
        };
      },
      {
        wrapper: Root,
      }
    );

    act(() => {
      result.current.setFieldVisibilityStage(stage);
    });

    const resultView = result.current.excludedFieldsStage;
    const expectedExcludedFields = stage.kwargs.field_names;
    expect(resultView[TEST_DS.name]).toStrictEqual(expectedExcludedFields);
  });

  // TODO: It would be nice to figure out how to test whether the view was set successfully
  //  when
});
