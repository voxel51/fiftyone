import React, { useState } from "react";
import {
  selector,
  snapshot_UNSTABLE,
  useRecoilCallback,
  useRecoilValue,
} from "recoil";
import { useSpring } from "react-spring";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { SwitcherDiv, SwitchDiv } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PATCHES_FIELDS } from "../../utils/labels";
import { useTheme } from "../../utils/hooks";

type PatcherProps = {
  modal: boolean;
};

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
    console.log(get(atoms.stateDescription).dataset);
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
          ["field", "ground_truth"],
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
        ["field", "ground_truth"],
        ["_state", null],
      ],
    });
  });
};

const LabelsPatches = () => {
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
              disabled={false}
              onClick={() => toPatches(field)}
            />
          );
        })}
      </>
    );
  }

  return (
    <ActionOption
      key={null}
      text={"No valid labels fields"}
      disabled={true}
      onClick={() => {}}
    />
  );
};

const EvaluationPatches = () => {
  const evaluations = useRecoilValue(evaluationKeys);
  const toEvaluationPatches = useToEvaluationPatches();

  if ([].length > 0) {
    return (
      <>
        {evaluations.map((evaluation) => {
          return (
            <ActionOption
              key={evaluation}
              text={evaluation}
              title={`Switch to ${evaluation} evaluation patches view`}
              disabled={false}
              onClick={() => toEvaluationPatches(evaluation)}
            />
          );
        })}
      </>
    );
  }
  return (
    <ActionOption
      key={null}
      text={"No evaluations"}
      disabled={true}
      onClick={() => {}}
    />
  );
};

const Patcher = ({ modal, bounds }: PatcherProps) => {
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
    <Popout modal={modal} bounds={bounds}>
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
      {labels && <LabelsPatches />}
      {!labels && <EvaluationPatches />}
    </Popout>
  );
};

export default React.memo(Patcher);
