import { LoadingDots, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import type { Primitive, Schema } from "@fiftyone/utilities";
import {
  EMBEDDED_DOCUMENT_FIELD,
  formatPrimitive,
  makePseudoField,
} from "@fiftyone/utilities";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { useSpring } from "@react-spring/core";
import React, { Suspense, useMemo, useState } from "react";
import {
  atomFamily,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import styled from "styled-components";
import { prettify } from "../../../utils/generic";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { NameAndCountContainer } from "../../utils";
import RegularEntry from "./RegularEntry";

const expandedPathValueEntry = atomFamily<boolean, string>({
  key: "expandedPathValueEntry",
  default: false,
  effects: (path) => [
    fos.getBrowserStorageEffectForKey(`expandedPathValueEntry-${path}`, {
      valueClass: "boolean",
    }),
  ],
});

const TitleDiv = styled.div`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.text.secondary};
`;

const ScalarDiv = styled.div`
  & > div:last-child {
    cursor: pointer;
  }
  & > div > span {
    cursor: text;
  }

  & > div {
    font-weight: bold;
    padding: 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.expanded > div {
    white-space: unset;
  }

  & a {
    color: ${({ theme }) => theme.text.primary};
  }
`;

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
  const [expanded, setExpanded] = useRecoilState(expandedPathValueEntry(path));

  return (
    <RegularEntry
      entryKey={entryKey}
      backgroundColor={backgroundColor}
      color={color}
      heading={null}
      trigger={trigger}
    >
      <ScalarDiv
        title={`Click to ${expanded ? "minimize" : "expand"}`}
        className={expanded ? "expanded" : ""}
        onClick={() => setExpanded((cur) => !cur)}
      >
        <Suspense fallback={<LoadingDots text="" />}>
          {slices ? <SlicesLoadable path={path} /> : <Loadable path={path} />}
        </Suspense>
        <FieldLabelAndInfo
          field={field ?? pseudoField}
          color={color}
          template={({ label, hoverTarget }) => (
            <TitleDiv>
              <span onClick={(e) => e.stopPropagation()} ref={hoverTarget}>
                {label}
              </span>
            </TitleDiv>
          )}
        />
      </ScalarDiv>
    </RegularEntry>
  );
};

const ListContainer = styled(ScalarDiv)`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;

  & > div {
    white-space: unset;
  }
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
  const field = useRecoilValue(fos.field(path));
  const pseudoField = makePseudoField(path);
  const { ftype, subfield, embeddedDocType } =
    useRecoilValue(fos.field(path)) ?? makePseudoField(path);

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
          <FieldLabelAndInfo
            field={field ?? pseudoField}
            color={color}
            template={({ label, hoverTarget }) => (
              <span onClick={(e) => e.stopPropagation()} ref={hoverTarget}>
                {label}
              </span>
            )}
          />

          <span key="value" data-cy={`sidebar-entry-${path}`}>
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
            data-cy={`sidebar-field-arrow-enabled-${path}`}
            style={{
              color: theme.text.secondary,
              cursor: "pointer",
              margin: 0,
            }}
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
  const data = useSlicesData<unknown[]>(path);

  return <>{Object.entries(data).filter(([_, v]) => v).length || 0}</>;
};

const LengthLoadable = ({ path }: { path: string }) => {
  const data = useData<unknown[]>(path);
  return <>{data?.length || 0}</>;
};

const ListLoadable = ({ path }: { path: string }) => {
  const data = useData<Primitive[]>(path);
  const { fields, ftype, subfield } = fos.useAssertedRecoilValue(
    fos.field(path)
  );
  const timeZone = useRecoilValue(fos.timeZone);

  const field = subfield || ftype;
  if (!field) {
    throw new Error(`expected an ftype for ${path}`);
  }

  const values = useMemo(() => {
    return Array.from(data || []).map((value) =>
      format({ fields, ftype: field, value, timeZone })
    );
  }, [data, field, fields, timeZone]);

  return (
    <ListContainer data-cy={`sidebar-entry-${path}`}>
      {values.map((v, i) => (
        <div key={i.toString()} title={typeof v === "string" ? v : undefined}>
          {v === null ? "None" : v}
        </div>
      ))}
      {values.length === 0 && "No results"}
    </ListContainer>
  );
};

const SlicesListLoadable = ({ path }: { path: string }) => {
  const values = useSlicesData<(string | number | null)[]>(path);
  const theme = useTheme();
  const textExpanded = useRecoilValue(expandedPathValueEntry(path));

  return (
    <>
      {Object.entries(values).map(([slice, data]) => {
        return (
          <ListContainer key={slice} className={textExpanded ? "expanded" : ""}>
            <div
              style={{
                color: theme.text.secondary,
                borderBottom: `1px solid ${theme.text.secondary}`,
              }}
            >
              {slice}
            </div>
            {(data || []).map((value, i) => (
              <div key={i.toString()}>{prettify(value as string)}</div>
            ))}
            {(!data || !data.length) && "No results"}
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
  const textExpanded = useRecoilValue(expandedPathValueEntry(path));

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
              justifyContent: "space-between",
              columnGap: "0.5rem",
              marginBottom: "0.5rem",
            }}
            key={i.toString()}
          >
            <div style={{ color: theme.text.secondary }}>{slice}</div>
            <div
              data-cy={`sidebar-entry-${slice}-${path}`}
              style={{
                ...add,
                flex: 1,
                whiteSpace: textExpanded ? "unset" : "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "right",
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

const useSlicesData = <T,>(path: string) => {
  const keys = path.split(".");
  const loadable = useRecoilValueLoadable(fos.active3dSlicesToSampleMap);
  const slices = Array.from(useRecoilValue(fos.active3dSlices) || []).sort();

  if (loadable.state === "loading") {
    throw loadable.contents;
  }

  if (loadable.state === "hasError") {
    throw loadable.contents;
  }

  if (!slices.every((slice) => loadable.contents[slice])) {
    throw new Promise(() => null);
  }

  const data = { ...loadable.contents } as object;

  const target = fos.useAssertedRecoilValue(fos.field(keys[0]));
  const isList = useRecoilValue(fos.isOfDocumentFieldList(path));
  for (const slice of slices) {
    data[slice] = fos.pullSidebarValue(
      target,
      keys,
      data[slice].sample,
      isList
    );
  }

  return data as { [slice: string]: T };
};

const Loadable = ({ path }: { path: string }) => {
  const value = useData<string | number | null>(path);
  const none = value === null || value === undefined;
  const { fields, ftype } =
    useRecoilValue(fos.field(path)) ?? makePseudoField(path);
  const color = useRecoilValue(fos.pathColor(path));
  const timeZone = useRecoilValue(fos.timeZone);

  const formatted = useMemo(
    () => format({ fields, ftype, timeZone, value }),
    [fields, ftype, timeZone, value]
  );

  return (
    <div
      data-cy={`sidebar-entry-${path}`}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={none ? { color } : {}}
      title={typeof formatted === "string" ? formatted : undefined}
    >
      {none ? "None" : formatted}
    </div>
  );
};

const useData = <T,>(path: string): T => {
  const keys = path.split(".");
  const loadable = useRecoilValueLoadable(fos.activeModalSidebarSample);

  if (loadable.state === "loading") {
    throw loadable.contents;
  }

  if (loadable.state === "hasError") {
    if (loadable.contents instanceof fos.SampleNotFound) {
      throw new Promise(() => null);
    }

    throw loadable.contents;
  }

  const field = fos.useAssertedRecoilValue(fos.field(keys[0]));
  const isList = useRecoilValue(fos.isOfDocumentFieldList(path));

  return fos.pullSidebarValue(field, keys, loadable.contents, isList) as T;
};

const isScalarValue = selectorFamily({
  key: "isScalarValue",
  get:
    (path: string) =>
    ({ get }) => {
      return !get(fos.isListField(path)) && !get(fos.isInListField(path));
    },
});

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
  const pinned3DSample = useRecoilValue(fos.pinned3DSampleSlice);
  const active3dSlices = useRecoilValue(fos.active3dSlices);
  const slices = Boolean(pinned3DSample) && (active3dSlices?.length || 1) > 1;

  const isScalar = useRecoilValue(isScalarValue(path));
  return isScalar ? (
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

interface PrimitivesObject {
  [key: string]: Primitive;
}

type Primitives = Primitive | PrimitivesObject;

const format = ({
  fields,
  ftype,
  timeZone,
  value,
}: {
  fields?: Schema;
  ftype: string;
  timeZone: string;
  value: Primitives;
}) => {
  if (ftype === EMBEDDED_DOCUMENT_FIELD && typeof value === "object") {
    return formatObject({ fields, timeZone, value: value as object });
  }

  return formatPrimitiveOrURL({ ftype, value: value as Primitive, timeZone });
};

const formatPrimitiveOrURL = (params: {
  fields?: Schema;
  ftype: string;
  timeZone: string;
  value: Primitive;
}) => {
  const result = formatPrimitive(params);

  return result instanceof URL ? (
    <a href={result.toString()} target="_blank" rel="noreferrer">
      {result.toString()}
    </a>
  ) : (
    result
  );
};

const formatObject = ({
  fields,
  timeZone,
  value,
}: {
  fields?: Schema;
  timeZone: string;
  value: object;
}) => {
  return Object.entries(value)
    .map(([k, v]) => {
      if (!fields?.[k]?.ftype) {
        return null;
      }

      const text = formatPrimitiveOrURL({
        ftype: fields?.[k]?.ftype,
        timeZone,
        value: v,
      });

      return (
        <div
          data-cy={`key-value-${k}-${text}`}
          key={k}
          style={{ display: "flex", justifyContent: "space-between" }}
        >
          <span data-cy={`key-${k}`}>{k}</span>
          <span data-cy={`value-${text}`}>{text}</span>
        </div>
      );
    })
    .filter((entry) => Boolean(entry));
};

export default React.memo(PathValueEntry);
