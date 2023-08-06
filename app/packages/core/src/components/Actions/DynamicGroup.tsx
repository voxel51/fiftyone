import {
  Button,
  PopoutSectionTitle,
  Selector,
  TabOption,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useSetView } from "@fiftyone/state";
import { Alert } from "@mui/material";
import React, {
  MutableRefObject,
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

const SelectorValueComponent = ({ value }: { value: string }) => {
  return <div style={{ fontSize: "1rem" }}>{value}</div>;
};

export default ({
  close,
  isProcessing,
  setIsProcessing,
  anchorRef,
}: {
  close: (e?: React.MouseEvent<Element>) => void;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  anchorRef: MutableRefObject<unknown>;
}) => {
  const [groupBy, setGroupBy] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("");
  const [useOrdered, setUseOrdered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  fos.useOutsideClick(
    ref,
    useCallback(
      (event) => {
        const exceptionEl = document.getElementById(SELECTOR_RESULTS_ID);
        if (exceptionEl && exceptionEl.contains(event.target as HTMLElement)) {
          return;
        }

        close(event);
      },
      [close]
    )
  );
  const setView = useSetView(
    true,
    false,
    useCallback(() => setIsProcessing(false), [setIsProcessing])
  );

  const [validationError, setValidationError] = useState<string>("");

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
  }, [
    canSubmitRequest,
    close,
    groupBy,
    orderBy,
    useOrdered,
    setIsProcessing,
    setView,
  ]);

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
  }, [close, setView]);

  const groupByOptionsSearchSelector = useCallback((search: string) => {
    const fields = useRecoilValue(fos.dynamicGroupFields);

    const values = fields.filter((name) => {
      return name.includes(search);
    });
    return { values, total: values?.length ?? 0 };
  }, []);
  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);
  const fields = useRecoilValueLoadable(fos.dynamicGroupFields);
  if (fields.state === "hasError") throw fields.contents;

  return (
    <Popout modal={false} fixed anchorRef={anchorRef}>
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
            <Selector
              id={SELECTOR_RESULTS_ID}
              data-cy="group-by-selector"
              inputStyle={{
                fontSize: "1rem",
                minWidth: "100%",
              }}
              component={SelectorValueComponent}
              onSelect={setGroupBy}
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
                data-cy="order-by-selector"
                inputStyle={{ fontSize: "1rem", minWidth: "100%" }}
                component={SelectorValueComponent}
                onSelect={setOrderBy}
                overflow={true}
                placeholder={"order by"}
                useSearch={groupByOptionsSearchSelector}
                value={orderBy ?? ""}
              />
            )}
            {validationError && (
              <Alert
                data-cy="dynamic-group-validation-error"
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
              data-cy="dynamic-group-btn-submit"
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
      </DynamicGroupContainer>
    </Popout>
  );
};
