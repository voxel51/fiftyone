import ReactDOM from "react-dom/client";
import { RecoilRoot } from "recoil";
import { SpacesRoot } from "./";
import "./App.css";

function App() {
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

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <RecoilRoot>
        <SpacesRoot id="main" defaultState={defaultState} />
      </RecoilRoot>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
