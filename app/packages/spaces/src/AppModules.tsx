import { Apps, Ballot, BarChart, Map, ScatterPlot } from "@mui/icons-material";
import {
  IconButton as MuiIconButton,
  IconButtonProps,
  Switch,
  Typography,
} from "@mui/material";
import { useRef } from "react";
import { atom, selectorFamily, useRecoilValue } from "recoil";
import styled from "styled-components";
import { usePanelState, usePanelTitle } from "./hooks";

// eslint-disable-next-line
export namespace State {
  export enum SPACE {
    FRAME = "FRAME",
    SAMPLE = "SAMPLE",
  }
}

export const fieldSchema = selectorFamily({
  key: "fieldSchema",
  get: () => () => {
    return [];
  },
});

export const excludedPluginsAtom = atom({
  key: "excludedPluginsAtom",
  default: new Set(),
});

export enum PluginComponentType {
  Visualizer,
  Plot,
  Panel,
}

function BasicPluginComponent(props: BasicPluginComponentProps) {
  const { name } = props;
  const [state, setState] = usePanelState(false);

  console.log(name, state);

  return (
    <Typography variant="h3" component="span">
      <Switch
        checked={state}
        onChange={() => {
          setState(!state);
        }}
        color="warning"
      />
      {name}
    </Typography>
  );
}

export function FormPluginComponent() {
  const [_, setTitle] = usePanelTitle();
  return <input type="text" onChange={(e) => setTitle(e.target.value)} />;
}

export function useActivePlugins(type: PluginComponentType) {
  const excludedPlugins = useRecoilValue(excludedPluginsAtom);
  if (type !== PluginComponentType.Panel) return [];
  const plugins = [
    {
      name: "Samples",
      label: "Samples",
      component: () => <BasicPluginComponent name="Samples" />,
      panelOptions: {
        allowDuplicates: false,
      },
      Icon: Apps,
      type: PluginComponentType.Panel,
    },
    {
      name: "Map",
      label: "Map",
      component: () => <BasicPluginComponent name="Map" />,
      panelOptions: {
        allowDuplicates: false,
      },
      Icon: Map,
      type: PluginComponentType.Panel,
    },
    {
      name: "Histograms",
      label: "Histograms",
      component: () => <BasicPluginComponent name="Histogram" />,
      Icon: BarChart,
      type: PluginComponentType.Panel,
    },
    {
      name: "Embeddings",
      label: "Embeddings",
      component: () => <BasicPluginComponent name="Embeddings" />,
      Icon: ScatterPlot,
      type: PluginComponentType.Panel,
    },
    {
      name: "Form",
      label: "Form",
      component: FormPluginComponent,
      Icon: Ballot,
      type: PluginComponentType.Panel,
    },
  ];
  return plugins.filter(({ name }) => !excludedPlugins.has(name));
}

export function useOutsideClick() {
  // do nothing
}

export function useDimensions() {
  const ref = useRef();
  return { ref };
}

export const Popout = styled.div`
  position: absolute;
  padding: 4px 8px;
  border: 1px solid #000;
  background: #1a1a1a;
  width: 12rem;
  top: 95%;
`;

export function IconButton(props: IconButtonProps) {
  return (
    <MuiIconButton
      {...props}
      sx={{
        p: 0.5,
        ml: 0.5,
        color: "#fff",
        ...props.sx,
      }}
    />
  );
}

/**
 * Types
 */

type BasicPluginComponentProps = {
  name: string;
};
