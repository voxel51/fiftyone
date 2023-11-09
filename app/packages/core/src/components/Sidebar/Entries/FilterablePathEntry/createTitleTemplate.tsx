import { PillButton } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Bolt, VisibilityOff } from "@mui/icons-material";
import React, { Suspense } from "react";
import { DefaultValue, selectorFamily, useRecoilState } from "recoil";
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

const createTitleTemplate =
  ({
    color,
    disabled,
    expandedPath,
    lightning,
    modal,
    path,
    showCounts,
  }: {
    disabled: boolean;
    expandedPath: string;
    modal: boolean;
    path: string;
    showCounts: boolean;
    lightning: boolean;
    color: string;
  }) =>
  ({ hoverHandlers, hoverTarget, container }) => {
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
          {lightning && !modal && <Bolt style={{ color }} />}
          {showCounts && (!lightning || modal) && (
            <PathEntryCounts key="count" modal={modal} path={expandedPath} />
          )}
          <Icon disabled={disabled} modal={modal} path={path} />
        </NameAndCountContainer>
      </>
    );
  };

export default createTitleTemplate;
