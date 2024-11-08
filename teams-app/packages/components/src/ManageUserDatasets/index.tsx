import React from "react";
import { Table, TableBody } from "@mui/material";
import { ManageUserDatasetsRow } from "@fiftyone/teams-components";

type UserDataset = {
  name: string;
  samplesCount: number;
  permission: string;
};

type ManageUserDatasetsProps = {
  datasets: Array<UserDataset>;
  readOnly?: boolean;
};

export default function ManageUserDatasets({
  datasets,
  readOnly,
}: ManageUserDatasetsProps) {
  return (
    <Table>
      <TableBody>
        {datasets.map((dataset) => (
          <ManageUserDatasetsRow
            key={dataset.name}
            disabled={readOnly}
            {...dataset}
          />
        ))}
      </TableBody>
    </Table>
  );
}
