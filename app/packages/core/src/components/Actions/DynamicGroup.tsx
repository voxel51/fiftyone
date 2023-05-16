import {
  Button,
  LoadingDots,
  PopoutSectionTitle,
  Selector,
  TabOption,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useSetView } from "@fiftyone/state";
import { Alert } from "@mui/material";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";
import Popout from "./Popout";

const SELECTOR_RESULTS_ID = "dynamic-group-selector-results";

const DynamicGroupContainer = styled.div`
  margin: 0.5rem 0;
  display: flex;
  flex-direction: column;
`;

const SelectorValueComponent = ({ value }) => {
  return <>{value}</>;
};

export default ({
  close,
  isProcessing,
  setIsProcessing,
}: {
  close: () => void;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
}) => {
  const [groupBy, setGroupBy] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("");
  const [useOrdered, setUseOrdered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onComplete = useCallback(() => {
    setIsProcessing(false);
  }, []);
  fos.useOutsideClick(ref, close, {
    exceptionIds: [SELECTOR_RESULTS_ID],
  });
  const setView = useSetView(true, false, onComplete);

  const [validationError, setValidationError] = useState<string>("");

  const fields = useRecoilValueLoadable(fos.dynamicGroupFields);

  const canSubmitRequest = useMemo(() => {
    if (isProcessing) {
      return false;
    }

    if (useOrdered) {
      return groupBy.length > 0 && orderBy.length > 0;
    }
    return groupBy.length > 0;
  }, [useOrdered, groupBy, orderBy, isProcessing]);

  useEffect(() => {
    setOrderBy("");
  }, [useOrdered]);

  const onSubmit = useCallback(() => {
    if (!canSubmitRequest) {
      return;
    }

    if (groupBy === orderBy) {
      setValidationError("Group by and order by fields must be different.");
      return;
    }
    setValidationError("");

    setIsProcessing(true);
    close();

    setView((v) => [
      ...v,
      {
        _cls: fos.GROUP_BY_VIEW_STAGE,
        kwargs: [
          ["field_or_expr", groupBy],
          ["order_by", useOrdered ? orderBy : null],
          ["match_expr", null],
          ["sort_expr", null],
          ["reverse", false],
          ["flat", false],
        ],
      },
    ]);
  }, [useOrdered, canSubmitRequest, setView, groupBy, orderBy]);

  const onClear = useCallback(() => {
    setView((v) => {
      const newView = [...v];
      const groupByIndex = newView.findIndex(
        (stage) => stage._cls === fos.GROUP_BY_VIEW_STAGE
      );
      if (groupByIndex !== -1) {
        newView.splice(groupByIndex, 1);
      }
      return newView;
    });
    close();
  }, [setView]);

  const groupByOptionsSearchSelector = useCallback(
    (search: string) => {
      if (fields.state !== "hasValue") {
        throw new Error("not ready");
      }
      const values = fields.contents.filter((name) => {
        return name.includes(search);
      });
      return { values, total: values?.length ?? 0 };
    },
    [fields]
  );
  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);

  if (fields.state === "hasError") throw fields.contents;
  return (
    <Popout modal={false}>
      <DynamicGroupContainer ref={ref}>
        {isDynamicGroupViewStageActive ? (
          <Button
            style={{
              width: "100%",
              cursor: "pointer",
            }}
            onClick={onClear}
          >
            Reset Dynamic Groups
          </Button>
        ) : (
          <>
            <PopoutSectionTitle>Group By</PopoutSectionTitle>
            {fields.state === "loading" && (
              <LoadingDots text="Loading fields" />
            )}

            {fields.state === "hasValue" && fields.contents.length && (
              <>
                <Selector
                  id={SELECTOR_RESULTS_ID}
                  inputStyle={{
                    height: 28,
                    width: "100%",
                    fontSize: "medium",
                  }}
                  component={SelectorValueComponent}
                  containerStyle={{
                    marginLeft: "0.5rem",
                    position: "relative",
                  }}
                  onSelect={setGroupBy}
                  resultsPlacement="center"
                  overflow={true}
                  placeholder={"group by"}
                  useSearch={groupByOptionsSearchSelector}
                  value={groupBy ?? ""}
                />

                <TabOption
                  active={useOrdered ? "ordered" : "unordered"}
                  disabled={isProcessing}
                  options={[
                    {
                      text: "ordered",
                      title: "Ordered",
                      onClick: () => setUseOrdered(true),
                    },
                    {
                      text: "unordered",
                      title: "Unordered",
                      onClick: () => setUseOrdered(false),
                    },
                  ]}
                />
                {useOrdered && (
                  <Selector
                    id={SELECTOR_RESULTS_ID}
                    inputStyle={{
                      height: 28,
                      width: "100%",
                      fontSize: "medium",
                    }}
                    component={SelectorValueComponent}
                    containerStyle={{
                      marginLeft: "0.5rem",
                      position: "relative",
                    }}
                    onSelect={setOrderBy}
                    resultsPlacement="center"
                    overflow={true}
                    placeholder={"order by"}
                    useSearch={groupByOptionsSearchSelector}
                    value={orderBy ?? ""}
                  />
                )}
                {validationError && (
                  <Alert
                    style={{ marginTop: "0.5rem" }}
                    severity="error"
                    onClose={() => {
                      setValidationError("");
                    }}
                  >
                    {validationError}
                  </Alert>
                )}
                <Button
                  style={{
                    width: "100%",
                    marginTop: "0.5rem",
                    cursor: !canSubmitRequest ? "not-allowed" : "pointer",
                  }}
                  disabled={!canSubmitRequest}
                  onClick={onSubmit}
                >
                  {isProcessing ? "Processing..." : "Submit"}
                </Button>
              </>
            )}
          </>
        )}
      </DynamicGroupContainer>
    </Popout>
  );
};
