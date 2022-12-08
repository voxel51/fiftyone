import React from "react";
import { selectorFamily } from "recoil";
import styled from "styled-components";
import { Apps, BarChart, Map, ScatterPlot } from "@mui/icons-material";

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
}
export function useActivePlugins() {
  return [
    {
      name: "Samples",
      label: "Samples",
      component: () => <h1>Samples</h1>,
      panelOptions: {
        canDuplicate: false,
      },
      Icon: Apps,
    },
    {
      name: "Map",
      label: "Map",
      component: () => <h1>Map</h1>,
      Icon: Map,
    },
    {
      name: "Histograms",
      label: "Histograms",
      component: () => <h1>Histograms</h1>,
      Icon: BarChart,
    },
    {
      name: "Embeddings",
      label: "Embeddings",
      component: () => <h1>Embeddings</h1>,
      Icon: ScatterPlot,
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
