import {
  Button,
  PillButton,
  Popout,
  PopoutSectionTitle,
  Selector,
  TabOption,
} from "@fiftyone/components";
import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import { useOutsideClick, useSetView } from "@fiftyone/state";
import MergeIcon from "@mui/icons-material/Merge";
import React, { useCallback, useMemo, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styled from "styled-components";
import Input from "../Common/Input";
import * as fos from "@fiftyone/state";
import { ActionDiv } from "./ActionsRow";
import { useMachine } from "@xstate/react";

const DynamicGroupContainer = styled.div`
  margin: 0.5rem 0;
  display: flex;
  flex-direction: column;
`;

export const DynamicGroupAction = () => {
  const [open, setOpen] = useState(false);

  const [groupBy, setGroupBy] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("");

  const [isFieldValidated, setIsFieldValidated] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [useOrdered, setUseOrdered] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const [measureRef] = useMeasure();

  useOutsideClick(ref, () => open && setOpen(false));

  const onComplete = useRecoilCallback(({ set, reset }) => () => {
    setIsFieldValidated(false);
    setIsProcessing(false);
  });

  const setView = useSetView(true, false, onComplete);

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

    setView((v) => [
      ...v,
      {
        _cls: "fiftyone.core.stages.GroupBy",
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
  }, [canSubmitRequest, setView, groupBy, orderBy]);

  const pillComponent = useMemo(() => {
    if (isProcessing) {
      return <LoadingDots text="Loading groups" />;
    }
    return <MergeIcon />;
  }, [isProcessing]);

  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);

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
            <PopoutSectionTitle>Group By</PopoutSectionTitle>
            <Input
              value={groupBy}
              disabled={isProcessing}
              setter={setGroupBy}
              placeholder="field name or expression"
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
              <Input
                value={orderBy}
                disabled={isProcessing}
                setter={setOrderBy}
                placeholder="order by field"
              />
            )}
            <Button
              style={{
                width: "100%",
                cursor: !canSubmitRequest ? "not-allowed" : "pointer",
              }}
              disabled={!canSubmitRequest}
              onClick={onSubmit}
            >
              {isProcessing ? "Processing..." : "Submit"}
            </Button>
          </DynamicGroupContainer>
        </Popout>
      )}
    </ActionDiv>
  );
};
