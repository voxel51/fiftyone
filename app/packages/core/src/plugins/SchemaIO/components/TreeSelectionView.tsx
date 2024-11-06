import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Checkbox, FormControlLabel, IconButton } from "@mui/material";
import React, { useEffect } from "react";
import { ViewPropsType } from "../utils/types";
import { useUnboundState } from "@fiftyone/state";

interface CheckedState {
  [key: string]: {
    checked: boolean;
    indeterminate?: boolean;
  };
}

interface CollapsedState {
  [key: string]: boolean; // true for collapsed, false for expanded
}

interface CheckboxViewProps {
  id: string;
  label: string;
  isChecked: boolean;
  isIndeterminate: boolean;
  onChange: (id: string, checked: boolean) => void;
}

interface TreeNodeProps {
  nodeId: string;
  childrenIds: (string | [string, string[]])[];
  checkedState: CheckedState;
  collapsedState: CollapsedState;
  onChange: (id: string, checked: boolean) => void;
  onToggleCollapse: (id: string) => void;
}

export default function TreeSelectionView(props: ViewPropsType) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;

  if (data == undefined) {
    const sampleIds = view?.data.flatMap(([parentId, children]) => {
      return children.map((childId) =>
        typeof childId === "string" ? childId : childId[0]
      );
    });
    onChange(path, sampleIds);
  }

  const structure = view?.data || [];

  const initialCheckedState: CheckedState = React.useMemo(() => {
    const state: CheckedState = {
      selectAll: { checked: true, indeterminate: false },
    };
    structure.forEach(([parentId, children]) => {
      state[parentId] = { checked: true, indeterminate: false };
      children.forEach((childId) => {
        if (typeof childId === "string") {
          state[childId] = { checked: true };
        } else {
          state[childId[0]] = { checked: true, indeterminate: false };
          childId[1].forEach((nestedChildId) => {
            state[nestedChildId] = { checked: true };
          });
        }
      });
    });
    return state;
  }, [structure]);

  const [checkedState, setCheckedState] =
    React.useState<CheckedState>(initialCheckedState);

  const unboundState = useUnboundState(checkedState);

  // Initialize collapsed state for all parents
  const initialCollapsedState: CollapsedState = React.useMemo(() => {
    const state: CollapsedState = {};
    structure.forEach(([parentId]) => {
      state[parentId] = false; // start as expanded
    });
    return state;
  }, [structure]);

  const [collapsedState, setCollapsedState] = React.useState<CollapsedState>(
    initialCollapsedState
  );

  const handleCheckboxChange = (id: string, isChecked: boolean) => {
    setCheckedState((prevState) => {
      const updatedState = {
        ...prevState,
        [id]: { ...prevState[id], checked: isChecked },
      };

      if (id === "selectAll") {
        // Apply the checked/unchecked state to all items when 'selectAll' is toggled
        Object.keys(updatedState).forEach((key) => {
          updatedState[key] = { checked: isChecked, indeterminate: false };
        });
      } else {
        // Update children if the selected ID is a parent
        const parentEntry = structure.find(([parentId]) => parentId === id);
        if (parentEntry) {
          const [, children] = parentEntry;
          children.forEach((childId) => {
            if (typeof childId === "string") {
              updatedState[childId] = { checked: isChecked };
            } else {
              const [nestedParentId, nestedChildren] = childId;
              updatedState[nestedParentId] = {
                checked: isChecked,
                indeterminate: false,
              };
              nestedChildren.forEach((nestedChildId) => {
                updatedState[nestedChildId] = { checked: isChecked };
              });
            }
          });
          updatedState[id].indeterminate = false;
        }

        // Recursive function to update the checked/indeterminate state of parent nodes
        const updateParentState = (parentId) => {
          const parentEntry = structure.find(
            ([groupId]) => groupId === parentId
          );
          if (!parentEntry) return;

          const [, children] = parentEntry;
          const allChecked = children.every((childId) =>
            typeof childId === "string"
              ? updatedState[childId].checked
              : updatedState[childId[0]].checked
          );
          const someChecked = children.some((childId) =>
            typeof childId === "string"
              ? updatedState[childId].checked
              : updatedState[childId[0]].checked
          );

          updatedState[parentId] = {
            checked: allChecked,
            indeterminate: !allChecked && someChecked,
          };
        };

        // Propagate state to parent groups
        structure.forEach(([parentId]) => {
          updateParentState(parentId);
        });
      }

      // Update the selectAll checkbox status based on the final state of all nodes
      const allGroupsSelected = structure.every(
        ([parentId]) => updatedState[parentId].checked
      );
      const anySelected = structure.some(
        ([parentId]) =>
          updatedState[parentId].checked || updatedState[parentId].indeterminate
      );

      updatedState["selectAll"] = {
        checked: allGroupsSelected,
        indeterminate: anySelected && !allGroupsSelected,
      };

      const selectedSampleIds = Object.keys(updatedState).filter((key) => {
        const isSample =
          !structure.some(([parentId]) => parentId === key) &&
          key !== "selectAll";
        return isSample && updatedState[key].checked; // Only checked samples
      });

      // We update the actual output value (ctx.params.value \ data) here.
      onChange(path, selectedSampleIds);

      return updatedState;
    });
  };

  // Function to handle expand/collapse toggle
  const handleToggleCollapse = (id: string) => {
    setCollapsedState((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  const getGroupIdx = (
    groupId: string,
    structure: [string, (string | [string, string[]])[]][]
  ): number => {
    const idx = structure.findIndex(([id]) => id === groupId);
    return idx === -1 ? 0 : idx + 1;
  };

  useEffect(() => {
    const sampleIds = view?.data.flatMap(([parentId, children]) => {
      return children.map((childId) =>
        typeof childId === "string" ? childId : childId[0]
      );
    });
    onChange(path, sampleIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CheckboxView: Represents a single checkbox (either parent or child)
  function CheckboxView({
    id,
    label,
    isChecked,
    isIndeterminate,
    onChange,
  }: CheckboxViewProps) {
    return (
      <FormControlLabel
        control={
          <Checkbox
            id={id}
            checked={isChecked}
            indeterminate={isIndeterminate}
            onChange={(event) => onChange(id, event.target.checked)}
          />
        }
        label={label}
      />
    );
  }

  // TreeNode: Recursive component to render each parent and its children
  function TreeNode({
    nodeId,
    childrenIds,
    checkedState,
    collapsedState,
    onChange,
    onToggleCollapse,
  }: TreeNodeProps) {
    const isCollapsed = collapsedState[nodeId] || false;
    const count = childrenIds.length;
    const title = `Group ${getGroupIdx(nodeId, structure)}  • ${count} Samples`;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", ml: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {/* Render Parent Checkbox */}
          <CheckboxView
            id={nodeId}
            label={title}
            isChecked={checkedState[nodeId]?.checked || false}
            isIndeterminate={checkedState[nodeId]?.indeterminate || false}
            onChange={onChange}
          />
          {/* Expand/Collapse Button */}
          <IconButton onClick={() => onToggleCollapse(nodeId)} size="small">
            {isCollapsed ? <ChevronRightIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        {/* Render Child Checkboxes if expanded */}
        {!isCollapsed && (
          <Box sx={{ display: "flex", flexDirection: "column", ml: 3 }}>
            {childrenIds.map((childId) =>
              typeof childId === "string" ? (
                <CheckboxView
                  key={childId}
                  id={childId}
                  label={childId}
                  isChecked={checkedState[childId]?.checked || false}
                  isIndeterminate={false}
                  onChange={onChange}
                />
              ) : (
                <TreeNode
                  key={childId[0]}
                  nodeId={childId[0]}
                  childrenIds={childId[1]}
                  checkedState={checkedState}
                  collapsedState={collapsedState}
                  onChange={onChange}
                  onToggleCollapse={onToggleCollapse}
                />
              )
            )}
          </Box>
        )}
      </Box>
    );
  }

  // render the full structure
  return (
    <div>
      {/* Select All Checkbox */}
      <CheckboxView
        id="selectAll"
        label="Select All"
        isChecked={checkedState.selectAll.checked}
        isIndeterminate={checkedState.selectAll.indeterminate || false}
        onChange={handleCheckboxChange}
      />

      {/* Render Tree Structure */}
      {structure.map(([parentId, children]) => (
        <TreeNode
          key={parentId}
          nodeId={parentId}
          childrenIds={children}
          checkedState={checkedState}
          collapsedState={collapsedState}
          onChange={handleCheckboxChange}
          onToggleCollapse={handleToggleCollapse}
        />
      ))}
    </div>
  );
}
