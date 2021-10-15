import React, { useState } from "react";
import { atom, selector, useRecoilCallback, useRecoilValue } from "recoil";
import { useSpring } from "react-spring";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { SwitcherDiv, SwitchDiv } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import {
  CLIPS_FRAME_FIELDS,
  CLIPS_SAMPLE_FIELDS,
  FRAME_SUPPORT_FIELD,
  PATCHES_FIELDS,
} from "../../utils/labels";
import { useTheme } from "../../utils/hooks";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import {
  OBJECT_PATCHES,
  EVALUATION_PATCHES,
  CLIPS_VIEWS,
} from "../../utils/links";

export const patching = atom<boolean>({
  key: "patching",
  default: false,
});

export const patchesFields = selector<string[]>({
  key: "patchesFields",
  get: ({ get }) => {
    const paths = get(selectors.labelPaths);
    const types = get(selectors.labelTypesMap);
    return paths.filter((p) => PATCHES_FIELDS.includes(types[p]));
  },
});

export const clipsFields = selector<string[]>({
  key: "clipsFields",
  get: ({ get }) => {
    const paths = get(selectors.labelPaths);
    const types = get(selectors.labelTypesMap);
    const pschema = get(selectors.primitivesSchema("sample"));

    return [
      ...paths.filter((p) =>
        p.startsWith("frames.")
          ? CLIPS_FRAME_FIELDS.includes(types[p])
          : CLIPS_SAMPLE_FIELDS.includes(types[p])
      ),
      ...Object.entries(pschema)
        .filter(
          ([_, s]) =>
            s.ftype === FRAME_SUPPORT_FIELD ||
            s.subfield === FRAME_SUPPORT_FIELD
        )
        .map(([p]) => p),
    ].sort();
  },
});

const evaluationKeys = selector<string[]>({
  key: "evaluationKeys",
  get: ({ get }) => {
    return Object.keys(get(atoms.stateDescription).dataset.evaluations || {});
  },
});

const useToPatches = () => {
  return useRecoilCallback(
    ({ set }) => async (field) => {
      set(patching, true);
      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.ToPatches",
              kwargs: [
                ["field", field],
                ["_state", null],
              ],
            },
          ],
          with_selected: true,
        })
      );
    },
    []
  );
};

const useToClips = () => {
  return useRecoilCallback(
    ({ set }) => async (field) => {
      set(patching, true);
      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.ToClips",
              kwargs: [
                ["field_or_expr", field],
                ["_state", null],
              ],
            },
          ],
          with_selected: true,
        })
      );
    },
    []
  );
};

const useToEvaluationPatches = () => {
  return useRecoilCallback(
    ({ set }) => async (evaluation) => {
      set(patching, true);
      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.ToEvaluationPatches",
              kwargs: [
                ["eval_key", evaluation],
                ["_state", null],
              ],
            },
          ],
          with_selected: true,
        })
      );
    },
    []
  );
};

const LabelsClips = ({ close }) => {
  const fields = useRecoilValue(clipsFields);
  const toClips = useToClips();

  return (
    <>
      {fields.map((field) => {
        return (
          <ActionOption
            key={field}
            text={field}
            title={`Switch to clips view for the "${field}" field`}
            onClick={() => {
              close();
              toClips(field);
            }}
          />
        );
      })}
      <ActionOption
        key={0}
        text={"About clips views"}
        title={"About clips views"}
        href={CLIPS_VIEWS}
      />
    </>
  );
};

const LabelsPatches = ({ close }) => {
  const fields = useRecoilValue(patchesFields);
  const toPatches = useToPatches();

  return (
    <>
      {fields.map((field) => {
        return (
          <ActionOption
            key={field}
            text={field}
            title={`Switch to patches view for the "${field}" field`}
            onClick={() => {
              close();
              toPatches(field);
            }}
          />
        );
      })}
      <ActionOption
        key={0}
        text={"About patch views"}
        title={"About patch views"}
        href={OBJECT_PATCHES}
      />
    </>
  );
};

const EvaluationPatches = ({ close }) => {
  const evaluations = useRecoilValue(evaluationKeys);
  const toEvaluationPatches = useToEvaluationPatches();

  return (
    <>
      {evaluations.map((evaluation) => {
        return (
          <ActionOption
            key={evaluation}
            text={evaluation}
            title={`Switch to evaluation patches view for the "${evaluation}" evaluation`}
            onClick={() => {
              close();
              toEvaluationPatches(evaluation);
            }}
          />
        );
      })}
      <ActionOption
        key={0}
        text={"About evaluation views"}
        title={"About evaluation views"}
        href={EVALUATION_PATCHES}
      />
    </>
  );
};

type PatcherProps = {
  close: () => void;
};

const Patcher = ({ bounds, close }: PatcherProps) => {
  const theme = useTheme();
  const isVideo =
    useRecoilValue(selectors.isVideoDataset) &&
    useRecoilValue(selectors.isRootView);
  const isClips = useRecoilValue(selectors.isClipsView);
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
        {!isVideo && (
          <SwitchDiv
            style={evaluationProps}
            onClick={() => labels && setLabels(false)}
          >
            Evaluations
          </SwitchDiv>
        )}
      </SwitcherDiv>
      {labels && (isVideo || isClips) && <LabelsClips close={close} />}
      {labels && !isVideo && !isClips && <LabelsPatches close={close} />}
      {!labels && <EvaluationPatches close={close} />}
    </Popout>
  );
};

export default React.memo(Patcher);
