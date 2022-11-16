import * as fos from "@fiftyone/state";
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilState } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";
import { DatasetRenderer } from "./Dataset";

export const Dataset = () => {
  const [environment] = useState(fos.getEnvironment);
  return (
    <RecoilRoot>
      <RecoilRelayEnvironmentProvider
        environment={environment}
        environmentKey={fos.RelayEnvironmentKey}
      >
        <LoadableDataset />
      </RecoilRelayEnvironmentProvider>
    </RecoilRoot>
  );
};

const EXAMPLE_VIEW = [
  {
    _cls: "fiftyone.core.stages.Limit",
    kwargs: [["limit", 10]],
    _uuid: "020b33dd-775a-4b4a-a865-4901e2e6ee43",
  },
];

function LoadableDataset() {
  const [settings, setSettings] = React.useState({
    dataset: "quickstart",
    readOnly: false,
  });
  const [view, setView] = useRecoilState(fos.view);

  function printView() {
    console.log(JSON.stringify(view, null, 2));
  }

  function changeView() {
    setView(EXAMPLE_VIEW);
  }

  function clearView() {
    setView([]);
  }

  return (
    <>
      <DatasetSettings current={settings} onChange={setSettings} />
      <button onClick={() => printView()}>Print View</button>
      <button onClick={() => changeView()}>Set View</button>
      <button onClick={() => clearView()}>Clear View</button>
      <div style={{ height: "100vh", overflow: "hidden" }}>
        <DatasetRenderer
          dataset={settings.dataset}
          readOnly={settings.readOnly}
        />
      </div>
    </>
  );
}

function DatasetSettings({ current, onChange }) {
  const datasetInputRef = useRef<HTMLInputElement>();
  const readOnlyInputRef = useRef<HTMLInputElement>();
  function load(e) {
    e.preventDefault();
    const dataset = datasetInputRef.current
      ? datasetInputRef.current.value
      : null;
    const readOnly = readOnlyInputRef.current
      ? readOnlyInputRef.current.checked
      : false;
    onChange((s) => ({ ...s, dataset, readOnly }));
  }
  return (
    <form onSubmit={load}>
      <input
        ref={readOnlyInputRef}
        type="checkbox"
        defaultChecked={current.readOnly}
      />{" "}
      Read Only
      <input ref={datasetInputRef} type="text" defaultValue={current.dataset} />
      <button type="submit">load</button>
    </form>
  );
}

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <Dataset />
);
