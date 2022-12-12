import { Apps, Ballot, BarChart, Map, ScatterPlot } from "@mui/icons-material";
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
      component: () => <h1>Samples</h1>,
      panelOptions: {
        allowDuplicates: false,
      },
      Icon: Apps,
      type: PluginComponentType.Panel,
    },
    {
      name: "Map",
      label: "Map",
      component: () => <h1>Map</h1>,
      panelOptions: {
        allowDuplicates: false,
      },
      Icon: Map,
      type: PluginComponentType.Panel,
    },
    {
      name: "Histograms",
      label: "Histograms",
      component: () => <h1>Histograms</h1>,
      Icon: BarChart,
      type: PluginComponentType.Panel,
    },
    {
      name: "Embeddings",
      label: "Embeddings",
      component: () => <h1>Embeddings</h1>,
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

export const Popout = styled.div`
  position: absolute;
  padding: 4px 8px;
  border: 1px solid #000;
  background: #1a1a1a;
  left: 45%;
  width: 12rem;
  top: 95%;
`;
