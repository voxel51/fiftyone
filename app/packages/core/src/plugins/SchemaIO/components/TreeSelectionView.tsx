import { useUnboundState } from "@fiftyone/state";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Checkbox, FormControlLabel, IconButton } from "@mui/material";
import React, { useEffect } from "react";
import { getComponentProps } from "../utils";
import { ViewPropsType } from "../utils/types";

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
    onChange(path, []);
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
      state[parentId] = true; // start as expanded
    });
    return state;
  }, [structure]);

  const [collapsedState, setCollapsedState] = React.useState<CollapsedState>(
    initialCollapsedState
  );

  const [allCollapsed, setAllCollapsed] = React.useState(true);

  const handleExpandCollapseAll = () => {
    setCollapsedState((prevState) => {
      const newState = { ...prevState };
      Object.keys(newState).forEach((key) => {
        newState[key] = allCollapsed;
      });
      return newState;
    });
    setAllCollapsed(!allCollapsed); // Toggle the expand/collapse state
  };

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

  // this only runs when data and checkboxstate are different
  // meaning the user selected samples from the grid
  // we will handle the state change of checkedState here
  // ! do not use onChange here. A change triggered by python should not be sent back to python.
  useEffect(() => {
    if (!data) return;
    // extract the selected sample ids from the unboundState
    const selectedIdsFromUnboundState = Object.keys(unboundState).filter(
      (key) => {
        const isSample =
          !structure.some(([parentId]) => parentId === key) &&
          key !== "selectAll";
        return isSample && unboundState[key].checked; // Only checked samples
      }
    );

    const dataSet: Set<string> = new Set(data);
    const unboundSet: Set<string> = new Set(selectedIdsFromUnboundState);
    const hasDifference =
      dataSet.size !== unboundSet.size ||
      [...dataSet].some((id) => !unboundSet.has(id));

    if (hasDifference) {
      setCheckedState((prevState) => {
        const updatedState = { ...prevState };

        // Update the checked state of individual samples based on `dataSet`
        Object.keys(updatedState).forEach((key) => {
          if (
            key !== "selectAll" &&
            !structure.some(([parentId]) => parentId === key)
          ) {
            updatedState[key].checked = dataSet.has(key);
          }
        });

        // Update group (parent) states based on their children's state
        structure.forEach(([parentId, children]) => {
          const allChildrenChecked = children.every((childId) =>
            typeof childId === "string"
              ? updatedState[childId].checked
              : updatedState[childId[0]].checked
          );
          const someChildrenChecked = children.some((childId) =>
            typeof childId === "string"
              ? updatedState[childId].checked
              : updatedState[childId[0]].checked
          );

          updatedState[parentId] = {
            checked: allChildrenChecked,
            indeterminate: someChildrenChecked && !allChildrenChecked,
          };
        });

        // Update `selectAll` based on the sample checkboxes
        const allSamplesChecked = Object.keys(updatedState).every((key) => {
          const isSample =
            !structure.some(([parentId]) => parentId === key) &&
            key !== "selectAll";
          return !isSample || updatedState[key].checked;
        });

        updatedState["selectAll"] = {
          checked: allSamplesChecked,
          indeterminate: !allSamplesChecked && dataSet.size > 0,
        };

        return updatedState;
      });
    }
  }, [data, unboundState]);

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
    const title = `Group ${getGroupIdx(
      nodeId,
      structure
    )}  • ${count} Samples • ${nodeId}`;
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

  return (
    <Box {...getComponentProps(props, "container")}>
      <Box display="flex" alignItems="center">
        <CheckboxView
          id="selectAll"
          label="Select All"
          isChecked={checkedState.selectAll.checked}
          isIndeterminate={checkedState.selectAll.indeterminate || false}
          onChange={handleCheckboxChange}
        />
        <IconButton onClick={handleExpandCollapseAll} size="small">
          {allCollapsed ? <ChevronRightIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

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
    </Box>
  );
}
