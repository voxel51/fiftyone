import { PillButton } from "@fiftyone/app/src/components/utils";
import * as atoms from "@fiftyone/app/src/recoil/atoms";
import * as filterAtoms from "@fiftyone/app/src/recoil/filters";
import * as selectors from "@fiftyone/app/src/recoil/selectors";
import * as viewAtoms from "@fiftyone/app/src/recoil/view";
import { formatDateTime, getFetchFunction } from "@fiftyone/utilities";
import { ArrowDownward } from "@material-ui/icons";
import { useRecoilCallback } from "recoil";

const Export = () => {
  const download = useRecoilCallback(
    ({ snapshot }) => async () => {
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

  return (
    <div style={{ position: "relative" }}>
      <PillButton
        open={false}
        highlight={false}
        icon={<ArrowDownward />}
        onClick={download}
        title={"Download a filepath CSV"}
      />
    </div>
  );
};

export default Export;
