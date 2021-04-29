import React, { useState } from "react";
import { selector, useRecoilCallback, useRecoilValue } from "recoil";
import { useSpring } from "react-spring";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { SwitcherDiv, SwitchDiv } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PATCHES_FIELDS } from "../../utils/labels";
import { useTheme } from "../../utils/hooks";

const patchesFields = selector<string[]>({
  key: "parchesFields",
  get: ({ get }) => {
    const paths = get(selectors.labelPaths);
    const types = get(selectors.labelTypesMap);
    return paths.filter((p) => PATCHES_FIELDS.includes(types[p]));
  },
});

const appendStage = (set, view, stage) => {
  set(selectors.view, [...view, stage]);
};

const evaluationKeys = selector<string[]>({
  key: "evaluationKeys",
  get: ({ get }) => {
    return Object.keys(get(atoms.stateDescription).dataset.evaluations || {});
  },
});

const useToPatches = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (field) => {
      const view = await snapshot.getPromise(selectors.view);
      appendStage(set, view, {
        _cls: "fiftyone.core.stages.ToPatches",
        kwargs: [
          ["field", field],
          ["_state", null],
        ],
      });
    },
    []
  );
};

const useToEvaluationPatches = () => {
  return useRecoilCallback(({ snapshot, set }) => async (evaluation) => {
    const view = await snapshot.getPromise(selectors.view);
    appendStage(set, view, {
      _cls: "fiftyone.core.stages.ToEvaluationPatches",
      kwargs: [
        ["eval_key", evaluation],
        ["_state", null],
      ],
    });
  });
};

const LabelsPatches = ({ close }) => {
  const fields = useRecoilValue(patchesFields);
  const toPatches = useToPatches();

  if (fields.length) {
    return (
      <>
        {fields.map((field) => {
          return (
            <ActionOption
              key={field}
              text={field}
              title={`Switch to ${field} patches view`}
              onClick={() => {
                close();
                toPatches(field);
              }}
            />
          );
        })}
      </>
    );
  }

  return (
    <ActionOption
      text={"No labels fields"}
      title={"No labels fields"}
      href={"https://fiftyone.ai"}
    />
  );
};

const EvaluationPatches = ({ close }) => {
  const evaluations = useRecoilValue(evaluationKeys);
  const toEvaluationPatches = useToEvaluationPatches();

  if (evaluations.length) {
    return (
      <>
        {evaluations.map((evaluation) => {
          return (
            <ActionOption
              key={evaluation}
              text={evaluation}
              title={`Switch to ${evaluation} evaluation patches view`}
              onClick={() => {
                close();
                toEvaluationPatches(evaluation);
              }}
            />
          );
        })}
      </>
    );
  }
  return (
    <ActionOption
      text={"No evaluations"}
      title={"No evaluations"}
      href={"https://fiftyone.ai"}
    />
  );
};

type PatcherProps = {
  close: () => void;
};

const Patcher = ({ bounds, close }: PatcherProps) => {
  const theme = useTheme();
  const [labels, setLabels] = useState(true);

  const labelProps = useSpring({
    borderBottomColor: labels ? theme.brand : theme.backgroundDark,
    cursor: labels ? "default" : "pointer",
  });
  const evaluationProps = useSpring({
    borderBottomColor: labels ? theme.backgroundDark : theme.brand,
    cursor: labels ? "pointer" : "default",
  });
  return (
    <Popout modal={false} bounds={bounds}>
      <SwitcherDiv>
        <SwitchDiv
          style={labelProps}
          onClick={() => !labels && setLabels(true)}
        >
          Labels
        </SwitchDiv>
        <SwitchDiv
          style={evaluationProps}
          onClick={() => labels && setLabels(false)}
        >
          Evaluations
        </SwitchDiv>
      </SwitcherDiv>
      {labels && <LabelsPatches close={close} />}
      {!labels && <EvaluationPatches close={close} />}
    </Popout>
  );
};

export default React.memo(Patcher);
