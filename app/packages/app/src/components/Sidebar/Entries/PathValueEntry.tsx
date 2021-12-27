import { LIST_FIELD } from "@fiftyone/utilities";
import { KeyboardArrowDown, KeyboardArrowUp } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

import * as atoms from "../../../recoil/atoms";
import * as schemaAtoms from "../../../recoil/schema";
import { prettify } from "../../../utils/generic";
import { useTheme } from "../../../utils/hooks";

import { NameAndCountContainer } from "../../utils";

import RegularEntry from "./RegularEntry";

const ScalarDiv = styled.div`
  & > div {
    font-weight: bold;
    padding: 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const ScalarValueEntry = ({
  path,
  value,
}: {
  path: string;
  children: React.ReactNode;
}) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });

  return (
    <RegularEntry
      title={`${path}: ${value}`}
      backgroundColor={backgroundColor}
      heading={null}
    >
      <ScalarDiv>
        <div>{value}</div>
        <div
          style={{
            fontSize: "0.8rem",
            color: theme.fontDark,
          }}
        >
          {path}
        </div>
      </ScalarDiv>
    </RegularEntry>
  );
};

const ListContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const ListValueEntry = ({ path, data }: { path: string; data: unknown[] }) => {
  const [expanded, setExpanded] = useState(false);
  const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;

  const values = useMemo(() => {
    return data ? data.map((value) => prettify(value as string)) : [];
  }, [data]);
  const expandable = values && values.length;

  const count = prettify(values.length);

  return (
    <RegularEntry
      title={`${path}: ${count}`}
      heading={
        <NameAndCountContainer>
          <span key="path">{path}</span>
          <span key="value">{values.length}</span>
          {expandable && (
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
          )}
        </NameAndCountContainer>
      }
    >
      {expanded && (
        <ListContainer>
          {values.map((v) => (
            <div>{v}</div>
          ))}
        </ListContainer>
      )}
    </RegularEntry>
  );
};

const PathValueEntry = ({ path }: { path: string }) => {
  const field = useRecoilValue(schemaAtoms.field(path));
  let { sample: data } = useRecoilValue(atoms.modal);

  path.split(".").forEach((key) => (data = data[key]));

  if (field.ftype !== LIST_FIELD) {
    const value = prettify((data as unknown) as string);
    return <ScalarValueEntry path={path}>{value}</ScalarValueEntry>;
  }

  return <ListValueEntry path={path} data={(data as unknown) as unknown[]} />;
};

export default React.memo(PathValueEntry);
