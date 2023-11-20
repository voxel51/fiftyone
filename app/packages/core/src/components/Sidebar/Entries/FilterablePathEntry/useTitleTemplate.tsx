import { PillButton } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { VisibilityOff } from "@mui/icons-material";
import React, { Suspense } from "react";
import {
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { NameAndCountContainer } from "../../../utils";
import { PathEntryCounts } from "../EntryCounts";
import Icon from "./Icon";

const PATH_OVERRIDES = {
  tags: "sample tags",
  _label_tags: "label tags",
};

const hiddenPathLabels = selectorFamily<string[], string>({
  key: "hiddenPathLabels",
  get:
    (path) =>
    ({ get }) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modalSampleId);

      if (data[sampleId]) {
        return data[sampleId][path] || [];
      }

      return [];
    },
  set:
    (path) =>
    ({ set, get }, value) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modalSampleId);

      set(fos.pathHiddenLabelsMap, {
        ...data,
        [sampleId]: {
          ...data[sampleId],
          [path]: value instanceof DefaultValue ? [] : value,
        },
      });
    },
});

const Hidden = ({ path }: { path: string }) => {
  const [hidden, set] = useRecoilState(hiddenPathLabels(path));
  const num = hidden.length;
  const text = num.toLocaleString();

  return num ? (
    <PillButton
      title={text}
      text={text}
      icon={<VisibilityOff />}
      onClick={() => set([])}
      open={false}
      highlight={false}
      style={{
        height: "1.5rem",
        lineHeight: "1rem",
        padding: "0.25rem 0.5rem",
        margin: "0 0.5rem",
      }}
    />
  ) : null;
};

const useUnlocked = () => {
  const lightning = useRecoilValue(fos.lightning);
  const unlocked = useRecoilValueLoadable(fos.lightningUnlocked);
  return !lightning || (unlocked.state == "hasValue" && unlocked.contents);
};

const useTitleTemplate = ({
  modal,
  path,
}: {
  modal: boolean;
  path: string;
}) => {
  return function useTitleTemplate({ hoverHandlers, hoverTarget, container }) {
    const color = useRecoilValue(fos.pathColor(path));
    const disabled = useRecoilValue(fos.isDisabledPath(path));
    const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
    const lightning = useRecoilValue(fos.isLightningPath(path));
    const expandedPath = useRecoilValue(fos.expandPath(path));
    const unlocked = useUnlocked();

    return (
      <>
        <NameAndCountContainer
          ref={container}
          data-cy={`sidebar-field-container-${path}`}
        >
          <span key="path" data-cy={`sidebar-field-${path}`}>
            <span ref={hoverTarget} {...hoverHandlers}>
              {PATH_OVERRIDES[path] || path}
            </span>
          </span>
          {modal && (
            <Suspense>
              <Hidden path={path} />
            </Suspense>
          )}
          {!disabled && isFilterMode && (unlocked || modal) && (
            <PathEntryCounts key="count" modal={modal} path={expandedPath} />
          )}
          <Icon modal={modal} path={path} />
        </NameAndCountContainer>
      </>
    );
  };
};

export default useTitleTemplate;
