import { Checkbox, Size } from "@voxel51/voodo";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useSidebarExpandedState } from "@fiftyone/state";
import { makePseudoField } from "@fiftyone/utilities";
import Color from "color";
import React, { Suspense } from "react";
import { useReverbCallback, useReverbValue } from "@fiftyone/reverb";
import FieldLabelAndInfo from "../../../FieldLabelAndInfo";
import RegularEntry from "../RegularEntry";
import FilterablePathEntries from "./FilterablePathEntries";
import Loading from "./Loading";
import useTitleTemplate from "./useTitleTemplate";

const useOnChange = ({ modal, path }: { modal: boolean; path: string }) => {
  return useReverbCallback<[boolean], void>(
    ({ set }) =>
      (checked) => {
        set(fos.activeField({ modal, path }), checked);
      },
    [modal, path],
  );
};

const useField = (path: string) =>
  useReverbValue(fos.field(path)) || makePseudoField(path);

const FilterableEntry = ({
  disabled,
  entryKey,
  group,
  modal,
  path,
  onFocus,
  onBlur,
  trigger,
}: {
  disabled: boolean;
  entryKey: string;
  group: string;
  modal: boolean;
  path: string;
  onFocus?: () => void;
  onBlur?: () => void;
  trigger?: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void,
  ) => void;
}) => {
  const active = useReverbValue(fos.activeField({ modal, path }));
  const pathColor = useReverbValue(fos.pathColor(path));
  const field = useField(path);
  const fieldIsFiltered = useReverbValue(fos.fieldIsFiltered({ path, modal }));
  const expandedPath = useReverbValue(fos.expandPath(path));
  const [expanded, setExpanded] = useSidebarExpandedState({
    modal,
    path: expandedPath,
  });
  const onChange = useOnChange({ modal, path });
  const theme = useTheme();
  const color = disabled ? theme.background.paper : pathColor;

  return (
    <RegularEntry
      backgroundColor={
        fieldIsFiltered
          ? Color(color).alpha(0.25).string()
          : "var(--color-content-bg-card-nested)"
      }
      clickable={!disabled}
      color={color}
      entryKey={entryKey}
      onHeaderClick={!disabled ? () => setExpanded((v) => !v) : undefined}
      heading={
        <>
          {!disabled && !(modal && path === fos.LABEL_TAGS_FIELD) && (
            <Checkbox
              key="checkbox"
              checked={active}
              title={`Show ${path}`}
              size={Size.Sm}
              // the field's color in place of the brand fill when checked
              style={
                {
                  "--color-content-interactive-primary-default": color,
                  "--color-content-border-active": color,
                } as React.CSSProperties
              }
              data-cy={`checkbox-${path}`}
              onChange={onChange}
              onMouseUp={(e) => e.stopPropagation()}
            />
          )}
          {
            <FieldLabelAndInfo
              key={"info"}
              field={field}
              path={path}
              color={color}
              expandedPath={expandedPath}
              template={useTitleTemplate({
                group,
                modal,
                path,
              })}
            />
          }
        </>
      }
      trigger={trigger}
    >
      {expanded && (
        <Suspense fallback={<Loading />}>
          <FilterablePathEntries
            {...{
              modal,
              onBlur,
              onFocus,
              path,
            }}
          />
        </Suspense>
      )}
    </RegularEntry>
  );
};

export default React.memo(FilterableEntry);
