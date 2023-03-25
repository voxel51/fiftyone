import ReactDOM from "react-dom/client";
import { RecoilRoot, useRecoilState } from "recoil";
import { Layout, SpacesRoot } from "./";
import "./App.css";
import { excludedPluginsAtom } from "./AppModules";
import { useState } from "react";

function App() {
  const [datasetName, setDatasetName] = useState("quickstart");
  const [state, setState] = useRecoilState(excludedPluginsAtom);
  const defaultState = {
    id: "root",
    children: [
      {
        id: "default-left-space",
        children: [
          {
            id: "default-samples-panel",
            children: [],
            type: "Samples",
            pinned: true,
          },
        ],
        type: "panel-container",
        activeChild: "default-samples-panel",
      },
      {
        id: "default-right-space",
        children: [
          {
            id: "default-histograms-panel",
            children: [],
            type: "Histograms",
          },
        ],
        type: "panel-container",
        activeChild: "default-histograms-panel",
      },
    ],
    type: "panel-container",
    layout: Layout.Horizontal,
  };

  function toggleExclude(name: string) {
    const nextState = new Set(state);
    if (nextState.has(name)) nextState.delete(name);
    else nextState.add(name);
    setState(nextState);
  }

  return (
    <div>
      <span>Exclude: </span>
      <input
        type="checkbox"
        id="embedding"
        name="embedding"
        value="embedding"
        onClick={() => toggleExclude("Embeddings")}
      />
      <label htmlFor="embedding">Embeddings</label>
      <input
        type="checkbox"
        id="form"
        name="form"
        value="form"
        onClick={() => toggleExclude("Form")}
      />
      <label htmlFor="form">Form</label>
      <input
        type="checkbox"
        id="map"
        name="map"
        value="map"
        onClick={() => toggleExclude("Map")}
      />
      <label htmlFor="map">Map</label>
      <select
        name="dataset"
        id="dataset"
        style={{ marginLeft: 16 }}
        onChange={(e) => setDatasetName(e.target.value)}
      >
        <option value="quickstart">quickstart</option>
        <option value="quickstart-geo">quickstart-geo</option>
        <option value="quickstart-video">quickstart-video</option>
      </select>
      <div style={{ height: "calc(100vh - 25px)", width: "100vw" }}>
        <SpacesRoot id={`main-${datasetName}`} defaultState={defaultState} />
      </div>
    </div>
  );
}

function RecoilApp() {
  return (
    <RecoilRoot>
      <App />
    </RecoilRoot>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <RecoilApp />
);
