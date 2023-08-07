import React from "react";
import { renderHook, act } from "@testing-library/react-hooks";
import { RecoilRoot, useRecoilState, useRecoilValue } from "recoil";

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

describe("useSearchSchemaFields ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should set selectedFieldsStageState to a value when called", async () => {
    const { result } = renderHook(
      () => {
        const [selectedFieldsStage, setSelectedFieldsStage] = useRecoilState(
          fos.selectedFieldsStageState
        );

        return {
          useSearchSchemaFields: fos.useSearchSchemaFields({
            [FIELDS.ID_FIELD.path]: FIELDS.ID_FIELD,
            [FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD.path]:
              FIELDS.CUSTOM_EMBEDDED_DOCUMENT_FIELD,
            [FIELDS.CUSTOM_EMBEDDED_DOCUMENT_NAME_FIELD.path]:
              FIELDS.CUSTOM_EMBEDDED_DOCUMENT_NAME_FIELD,
          }),
          selectedFieldsStage,
          setSelectedFieldsStage,
        };
      },
      {
        wrapper: Root,
      }
    );

    expect(result.current.selectedFieldsStage).toBeUndefined();

    act(() => {
      result.current.setSelectedFieldsStage({});
    });

    expect(result.current.selectedFieldsStage).toBeDefined();
  });
});
