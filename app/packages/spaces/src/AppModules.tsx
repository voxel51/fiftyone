import { Apps, Ballot, BarChart, Map, ScatterPlot } from "@mui/icons-material";
import { IconButton as MuiIconButton, Typography } from "@mui/material";
import { selectorFamily } from "recoil";
import styled from "styled-components";
import { usePanelTitle } from "./hooks";

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

export enum PluginComponentType {
  Visualizer,
  Plot,
  Panel,
}

export function useActivePlugins(type: PluginComponentType) {
  if (type !== PluginComponentType.Panel) return [];
  return [
    {
      name: "Samples",
      label: "Samples",
      component: () => (
        <Typography variant="h3" component="span">
          Samples
        </Typography>
      ),
      panelOptions: {
        allowDuplicates: false,
      },
      Icon: Apps,
      type: PluginComponentType.Panel,
    },
    {
      name: "Map",
      label: "Map",
      component: () => (
        <Typography variant="h3" component="span">
          Map
        </Typography>
      ),
      panelOptions: {
        allowDuplicates: false,
      },
      Icon: Map,
      type: PluginComponentType.Panel,
    },
    {
      name: "Histograms",
      label: "Histograms",
      component: () => (
        <Typography variant="h3" component="span" sx={{ m: 2 }}>
          Histograms
        </Typography>
      ),
      Icon: BarChart,
      type: PluginComponentType.Panel,
    },
    {
      name: "Embeddings",
      label: "Embeddings",
      component: () => (
        <Typography variant="h3" component="span" sx={{ m: 2 }}>
          Embeddings
        </Typography>
      ),
      Icon: ScatterPlot,
      type: PluginComponentType.Panel,
    },
    {
      name: "Form",
      label: "Form",
      component: () => {
        const [_, setTitle] = usePanelTitle();
        return <input type="text" onChange={(e) => setTitle(e.target.value)} />;
      },
      Icon: Ballot,
      type: PluginComponentType.Panel,
    },
  ];
}

export function useOutsideClick() {}

export const Popout = styled.div`
  position: absolute;
  padding: 4px 8px;
  border: 1px solid #000;
  background: #1a1a1a;
  width: 12rem;
  top: 95%;
`;

export function IconButton(props) {
  return (
    <MuiIconButton
      disableRipple
      {...props}
      sx={{
        p: 0.5,
        ml: 0.5,
        color: "#fff",
        ":hover": { backgroundColor: "hsl(200, 0%, 25%)" },
        ...props.sx,
      }}
    />
  );
}
