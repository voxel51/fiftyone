import { TextColor, Tooltip, ZapIcon } from "@voxel51/voodo";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import Arrow from "./Arrow";

export const LightningBolt = ({
  color,
  tooltip,
}: {
  color?: string;
  tooltip?: string;
}) => {
  return (
    <Tooltip content={tooltip} style={{ display: "flex" }}>
      <span data-cy={"query-performance"} style={{ display: "flex" }}>
        <ZapIcon
          size={14}
          color={color ?? TextColor.Secondary}
          style={{ marginRight: 2 }}
        />
      </span>
    </Tooltip>
  );
};

const Lightning = ({
  path,
  frameFilteringDisabled,
}: {
  path: string;
  frameFilteringDisabled: boolean;
}) => {
  const color = useReverbValue(fos.pathColor(path));
  const compound = useReverbValue(fos.isCompoundIndexed(path));
  const expandedPath = useReverbValue(fos.expandPath(path));
  const gridOptimized = useReverbValue(
    fos.pathHasIndexes({ path, withFilters: true }),
  );
  const sidebarOptimized = useReverbValue(
    fos.pathHasIndexes({ path, withFilters: false }),
  );

  const tooltip = useMemo(() => {
    const tooltip = compound ? "Compound indexed" : "Indexed";

    if (gridOptimized && sidebarOptimized) {
      return `${tooltip}. Sidebar and grid are optimized`;
    }

    if (gridOptimized) {
      return `${tooltip}. Grid is optimized`;
    }

    return `${tooltip}. Sidebar is optimized`;
  }, [compound, gridOptimized, sidebarOptimized]);

  return (
    <>
      <LightningBolt
        color={gridOptimized ? color : undefined}
        tooltip={tooltip}
      />
      <Arrow
        expanded={fos.sidebarExpanded({ modal: false, path: expandedPath })}
        id={path}
        frameFilterDisabledPath={frameFilteringDisabled}
      />
    </>
  );
};

const IconWrapper = ({ modal, path }: { modal: boolean; path: string }) => {
  const disabled = useReverbValue(fos.isDisabledFilterPath(path)) && !modal;
  const expandedPath = useReverbValue(fos.expandPath(path));
  const frameFilteringDisabled =
    useReverbValue(fos.isDisabledFrameFilterPath(path)) && !modal;
  const indexed = useReverbValue(fos.pathHasIndexes({ path }));
  const filteredIndex = useReverbValue(
    fos.pathHasIndexes({ path, withFilters: true }),
  );
  const queryPerformance = useReverbValue(fos.queryPerformance);
  const frameField = useReverbValue(fos.isFrameField(path));

  if (queryPerformance && (indexed || filteredIndex) && !modal && !frameField) {
    return (
      <Lightning path={path} frameFilteringDisabled={frameFilteringDisabled} />
    );
  }

  return (
    <Arrow
      disabled={disabled}
      expanded={fos.sidebarExpanded({ modal, path: expandedPath })}
      frameFilterDisabledPath={frameFilteringDisabled}
      id={path}
    />
  );
};

export default React.memo(IconWrapper);
