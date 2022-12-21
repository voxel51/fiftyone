import ReactDOM from "react-dom/client";
import { RecoilRoot, useRecoilState } from "recoil";
import { SpacesRoot } from "./";
import "./App.css";
import { excludedPluginsAtom } from "./AppModules";

function App() {
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
    layout: "horizontal",
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
      <div style={{ height: "calc(100vh - 25px)", width: "100vw" }}>
        <SpacesRoot id="main" defaultState={defaultState} />
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
