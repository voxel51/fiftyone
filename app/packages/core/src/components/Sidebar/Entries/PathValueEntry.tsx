import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  formatDate,
  formatDateTime,
  FRAME_SUPPORT_FIELD,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { useSpring } from "@react-spring/core";
import React, { Suspense, useMemo, useState } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";
import LoadingDots from "../../../../../components/src/components/Loading/LoadingDots";
import { prettify } from "../../../utils/generic";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { NameAndCountContainer } from "../../utils";
import RegularEntry from "./RegularEntry";
import { makePseudoField } from "./utils";

const ScalarDiv = styled.div`
  & > div {
    user-select: text;
    font-weight: bold;
    padding: 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const format = ({
  ftype,
  timeZone,
  value,
}: {
  ftype: string;
  timeZone: string;
  value: unknown;
}) => {
  if (value === undefined) return value;

  if (value === null) return;

  switch (ftype) {
    case FRAME_SUPPORT_FIELD:
      value = `[${value[0]}, ${value[1]}]`;
    case DATE_FIELD:
      // @ts-ignore
      value = formatDate(value.datetime as number);
    case DATE_TIME_FIELD:
      // @ts-ignore
      value = formatDateTime(value.datetime as number, timeZone);
  }

  return prettify(value as string);
};

const ScalarValueEntry = ({
  entryKey,
  path,
  trigger,
  slices,
}: {
  entryKey: string;
  path: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
  slices?: boolean;
}) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.background.level1,
  });
  const color = useRecoilValue(fos.pathColor(path));

  const field = useRecoilValue(fos.field(path));
  const pseudoField = makePseudoField(path);

  return (
    <RegularEntry
      entryKey={entryKey}
      backgroundColor={backgroundColor}
      color={color}
      heading={null}
      trigger={trigger}
    >
      <ScalarDiv>
        <Suspense fallback={<LoadingDots text="" />}>
          {slices ? <SlicesLoadable path={path} /> : <Loadable path={path} />}
        </Suspense>
        <FieldLabelAndInfo
          field={field ?? pseudoField}
          color={color}
          template={({ label, hoverTarget }) => (
            <div
              style={{
                fontSize: "0.8rem",
                color: theme.text.secondary,
              }}
            >
              <span ref={hoverTarget}>{label}</span>
            </div>
          )}
        />
      </ScalarDiv>
    </RegularEntry>
  );
};

const ListContainer = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const ListValueEntry = ({
  entryKey,
  path,
  trigger,
  slices,
}: {
  entryKey: string;
  path: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
  slices?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;

  const color = useRecoilValue(fos.pathColor(path));
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.background.level1,
  });
  const { ftype, subfield, embeddedDocType } =
    useRecoilValue(fos.field(path)) ?? makePseudoField(path);

  const OVERRIDE = {
    tags: "sample tags",
  };

  return (
    <RegularEntry
      entryKey={entryKey}
      title={`${path} (${
        embeddedDocType
          ? embeddedDocType
          : subfield
          ? `${ftype}(${subfield})`
          : ftype
      })`}
      backgroundColor={backgroundColor}
      color={color}
      heading={
        <NameAndCountContainer>
          <span key="path">{OVERRIDE[path] ?? path}</span>
          <span key="value">
            <Suspense fallback={<LoadingDots text="" />}>
              {slices ? (
                <SlicesLengthLoadable path={path} />
              ) : (
                <LengthLoadable path={path} />
              )}
            </Suspense>
          </span>
          <Arrow
            key="arrow"
            style={{ cursor: "pointer", margin: 0 }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setExpanded(!expanded);
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          />
        </NameAndCountContainer>
      }
      trigger={trigger}
    >
      {expanded && (
        <Suspense fallback={null}>
          {slices ? (
            <SlicesListLoadable path={path} />
          ) : (
            <ListLoadable path={path} />
          )}
        </Suspense>
      )}
    </RegularEntry>
  );
};

const SlicesLengthLoadable = ({ path }: { path: string }) => {
  const data = useSlicesData<any[]>(path);

  return <>{Object.entries(data).filter(([_, v]) => v).length || 0}</>;
};

const LengthLoadable = ({ path }: { path: string }) => {
  const data = useData<any[]>(path);
  return <>{data?.length || 0}</>;
};

const ListLoadable = ({ path }: { path: string }) => {
  const data = useData<any[]>(path);
  const values = useMemo(() => {
    return data
      ? Array.from(data).map((value) => prettify(value as string))
      : [];
  }, [data]);

  return (
    <ListContainer>
      {values.map((v, i) => (
        <div key={i}>{v}</div>
      ))}
      {values.length == 0 && <>No results</>}
    </ListContainer>
  );
};

const SlicesListLoadable = ({ path }: { path: string }) => {
  const values = useSlicesData<(string | number | null)[]>(path);
  const theme = useTheme();
  return (
    <>
      {Object.entries(values).map(([slice, data]) => {
        return (
          <ListContainer key={slice}>
            <div
              style={{
                color: theme.text.secondary,
                borderBottom: `1px solid ${theme.text.secondary}`,
              }}
            >
              {slice}
            </div>
            {(data || []).map((value, i) => (
              <div key={i}>{prettify(value as string)}</div>
            ))}
            {(!data || !data.length) && <>No results</>}
          </ListContainer>
        );
      })}
    </>
  );
};

const SlicesLoadable = ({ path }: { path: string }) => {
  const values = useSlicesData<string | number | null>(path);

  const { ftype } = useRecoilValue(fos.field(path)) ?? makePseudoField(path);
  const color = useRecoilValue(fos.pathColor(path));
  const timeZone = useRecoilValue(fos.timeZone);
  const theme = useTheme();

  return (
    <>
      {Object.entries(values).map(([slice, value], i) => {
        const none = value === null || value === undefined;
        const formatted = format({ ftype, value, timeZone });

        const add = none ? { color } : {};
        return (
          <div
            style={{
              display: "flex",
              justifyContent: "left",
              columnGap: "0.5rem",
            }}
            key={i}
          >
            <div style={{ color: theme.text.secondary }}>{slice}</div>
            <div
              data-cy={`sidebar-entry-${path}`}
              style={{
                ...add,
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {none ? "None" : formatted}
            </div>
          </div>
        );
      })}
    </>
  );
};

const useSlicesData = <T extends unknown>(path: string) => {
  const keys = path.split(".");
  const loadable = useRecoilValueLoadable(fos.activePcdSlicesToSampleMap);
  const slices = Array.from(useRecoilValue(fos.activePcdSlices) || []).sort();

  if (loadable.state === "loading") {
    throw loadable.contents;
  }

  if (loadable.state === "hasError") {
    throw loadable.contents;
  }

  if (!slices.every((slice) => loadable.contents[slice])) {
    throw new Promise(() => {});
  }

  const data = { ...loadable.contents };

  let field = useRecoilValue(fos.field(keys[0]));
  slices.forEach((slice) => {
    let sliceData = data[slice].sample;

    for (let index = 0; index < keys.length; index++) {
      if (!sliceData) {
        break;
      }
      const key = keys[index];

      sliceData = sliceData[field?.dbField || key];

      if (keys[index + 1]) {
        field = field?.fields[keys[index + 1]];
      }
    }
    data[slice] = sliceData;
  });

  return data as { [slice: string]: T };
};

const Loadable = ({ path }: { path: string }) => {
  const value = useData<string | number | null>(path);
  const none = value === null || value === undefined;
  const { ftype } = useRecoilValue(fos.field(path)) ?? makePseudoField(path);
  const color = useRecoilValue(fos.pathColor(path));
  const timeZone = useRecoilValue(fos.timeZone);
  const formatted = format({ ftype, value, timeZone });

  return (
    <div data-cy={`sidebar-entry-${path}`} style={none ? { color } : {}}>
      {none ? "None" : formatted}
    </div>
  );
};

const useData = <T extends unknown>(path: string): T => {
  const keys = path.split(".");
  const loadable = useRecoilValueLoadable(fos.activeModalSample);

  if (loadable.state === "loading") {
    throw loadable.contents;
  }

  if (loadable.state === "hasError") {
    if (loadable.contents instanceof fos.SampleNotFound) {
      throw new Promise(() => {});
    }

    throw loadable.contents;
  }

  let data = loadable.contents;
  let field = useRecoilValue(fos.field(keys[0]));

  if (field?.embeddedDocType === DYNAMIC_EMBEDDED_DOCUMENT_FIELD) {
    data = data?.[field?.dbField || keys[0]]?.map((d) => d[keys[1]]).join(", ");
  } else {
    for (let index = 0; index < keys.length; index++) {
      if (!data) {
        break;
      }

      const key = keys[index];

      data = data[field?.dbField || key];

      if (keys[index + 1]) {
        field = field?.fields[keys[index + 1]];
      }
    }
  }

  return data as T;
};

const PathValueEntry = ({
  entryKey,
  path,
  trigger,
}: {
  entryKey: string;
  path: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const field = useRecoilValue(fos.field(path));
  const pinned3DSample = useRecoilValue(fos.pinned3DSampleSlice);
  const activePcdSlices = useRecoilValue(fos.activePcdSlices);
  const slices = Boolean(pinned3DSample) && (activePcdSlices?.length || 1) > 1;

  return field && field.ftype !== LIST_FIELD ? (
    <ScalarValueEntry
      entryKey={entryKey}
      path={path}
      trigger={trigger}
      slices={slices}
    />
  ) : (
    <ListValueEntry
      entryKey={entryKey}
      path={path}
      trigger={trigger}
      slices={slices}
    />
  );
};

export default React.memo(PathValueEntry);
