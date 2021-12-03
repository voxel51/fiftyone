import React, { ReactNode, useRef } from "react";
import { useRecoilState } from "recoil";

import * as colorAtoms from "../../../recoil/color";
import * as schemaAtoms from "../../../recoil/schema";

type PathEntryProps = {
  name?: string;
  path: string;
  modal: boolean;
  disabled: boolean;
  pills?: ReactNode;
  children?: ReactNode;
  ftype?: string | string[];
  embeddedDocType?: string | string[];
  style?: React.CSSProperties;
};

export const PathEntry = React.memo(
  ({
    children,
    pills,
    disabled,
    modal,
    path,
    name,
    ftype,
    embeddedDocType,
    style,
  }: PathEntryProps) => {
    if (!name) {
      name = path;
    }
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );
    const canCommit = useRef(false);
    const color = useRecoilValue(colorAtoms.pathColor({ path, modal }));
    const theme = useTheme();
    const fieldIsFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );
    const expandedPath = useRecoilValue(schemaAtoms.expandPath(path));

    const containerProps = useSpring({
      backgroundColor: fieldIsFiltered ? "#6C757D" : theme.backgroundLight,
    });

    return (
      <Container
        onMouseDown={() => (canCommit.current = true)}
        onMouseMove={() => (canCommit.current = false)}
        onMouseUp={() => canCommit.current && setActive(!active)}
        style={{ ...containerProps, ...style }}
      >
        <Header>
          {!disabled && (
            <Checkbox
              disableRipple={true}
              checked={active}
              title={`Show ${name}`}
              onMouseDown={null}
              style={{
                color: active
                  ? color
                  : disabled
                  ? theme.fontDarkest
                  : theme.fontDark,
                padding: 0,
              }}
            />
          )}
          <span style={{ flexGrow: 1 }}>{name}</span>
          {
            <EntryCounts
              path={expandedPath}
              modal={modal}
              ftype={ftype}
              embeddedDocType={embeddedDocType}
            />
          }
          {pills}
        </Header>
        {children}
      </Container>
    );
  }
);
