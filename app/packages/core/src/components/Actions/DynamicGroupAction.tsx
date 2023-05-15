import {
  Button,
  PillButton,
  Popout,
  PopoutSectionTitle,
  Selector,
  TabOption,
} from "@fiftyone/components";
import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import * as fos from "@fiftyone/state";
import { useSetView } from "@fiftyone/state";
import MergeIcon from "@mui/icons-material/Merge";
import { Alert } from "@mui/material";
import React, { useCallback, useMemo, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ActionDiv } from "./ActionsRow";
import { useDynamicGroupChoices } from "./DynamicGroupAction/useDynamicGroupChoices";

const SELECTOR_RESULTS_ID = "dynamic-group-selector-results";

const DynamicGroupContainer = styled.div`
  margin: 0.5rem 0;
  display: flex;
  flex-direction: column;
`;

const SelectorValueComponent = ({ value }) => {
  return <>{value}</>;
};

export const DynamicGroupAction = () => {
  const [open, setOpen] = useState(false);

  const [groupBy, setGroupBy] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("");

  const [isFieldValidated, setIsFieldValidated] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [useOrdered, setUseOrdered] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const [measureRef] = useMeasure();
  fos.useOutsideClick(ref, () => setOpen(false), {
    exceptionIds: [SELECTOR_RESULTS_ID],
  });

  const onComplete = useCallback(() => {
    setIsFieldValidated(false);
    setIsProcessing(false);
  }, []);

  const setView = useSetView(true, false, onComplete);

  const { availableFields, error, isLoading } = useDynamicGroupChoices();

  const canSubmitRequest = useMemo(() => {
    if (isProcessing) {
      return false;
    }

    if (useOrdered) {
      return groupBy.length > 0 && orderBy.length > 0;
    }
    return groupBy.length > 0;
  }, [useOrdered, groupBy, orderBy, isProcessing]);

  const onSubmit = useCallback(() => {
    if (!canSubmitRequest) {
      return;
    }

    setIsProcessing(true);
    setOpen(false);

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
  }, [setView]);

  const pillComponent = useMemo(() => {
    if (isProcessing) {
      return <LoadingDots text="Loading groups" />;
    }
    return <MergeIcon />;
  }, [isProcessing]);

  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);

  const searchSelector = useCallback(
    (search: string) => {
      const values = availableFields?.filter((name) => {
        return name.includes(search);
      });
      return { values, total: values?.length ?? 0 };
    },
    [availableFields]
  );

  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={pillComponent}
        open={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        highlight={open || isDynamicGroupViewStageActive}
        title={"Create dynamic groups"}
        text={isFieldValidated && groupBy.length > 0 ? groupBy : undefined}
        ref={measureRef}
        style={{
          cursor: "pointer",
        }}
      />
      {open && (
        <Popout modal={false}>
          <DynamicGroupContainer>
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
                {isLoading && <LoadingDots text="Loading fields" />}
                {error && <Alert severity="error">{error}</Alert>}

                {!isLoading && !error && availableFields && (
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
                      useSearch={searchSelector}
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
                        useSearch={searchSelector}
                        value={orderBy ?? ""}
                      />
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
      )}
    </ActionDiv>
  );
};
