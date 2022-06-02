import { formatDateTime, getFetchFunction } from "@fiftyone/utilities";
import React, { useState } from "react";
import { useRecoilCallback } from "recoil";

import * as atoms from "../../recoil/atoms";
import * as filterAtoms from "../../recoil/filters";
import * as selectors from "../../recoil/selectors";
import * as viewAtoms from "../../recoil/view";

import Checkbox from "../Common/Checkbox";
import { Button, PopoutSectionTitle } from "../utils";

import Popout from "./Popout";

const useDownload = () => {
  return useRecoilCallback(
    ({ snapshot }) => async (tags: boolean) => {
      const dataset = await snapshot.getPromise(selectors.datasetName);
      const timeZone = await snapshot.getPromise(selectors.timeZone);
      const sample_ids = await snapshot.getPromise(atoms.selectedSamples);
      const blob = await getFetchFunction()(
        "POST",
        "/export",
        {
          filters: await snapshot.getPromise(filterAtoms.filters),
          view: await snapshot.getPromise(viewAtoms.view),
          dataset,
          sample_ids: [...sample_ids],
          tags,
        },
        "blob"
      );
      const url = window.URL.createObjectURL(new Blob([blob as BlobPart]));
      const link = document.createElement("a");
      link.style.display = "none";
      link.href = url;
      link.setAttribute(
        "download",
        `${dataset}-${formatDateTime(Date.now(), timeZone)
          .replaceAll(":", "-")
          .replaceAll(", ", "-")}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode && link.parentNode.removeChild(link);
    },
    []
  );
};

const Export = ({
  close,
  bounds,
}: {
  bounds: [number, number];
  close: () => void;
}) => {
  const download = useDownload();
  const [includeTags, setIncludeTags] = useState(false);

  return (
    <Popout modal={false} bounds={bounds}>
      <Checkbox
        name={"Include tags"}
        value={includeTags}
        setValue={setIncludeTags}
      />
      <PopoutSectionTitle />
      <Button
        text={"Export CSV"}
        title={`Export CSV`}
        onClick={() => {
          close();
          download(includeTags);
        }}
        style={{
          margin: "0.25rem -0.5rem",
          height: "2rem",
          borderRadius: 0,
          textAlign: "center",
        }}
      />
    </Popout>
  );
};

export default Export;
