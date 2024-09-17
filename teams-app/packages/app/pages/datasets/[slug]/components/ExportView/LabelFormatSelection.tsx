import { useExportView } from '@fiftyone/hooks';
import { Selection } from '@fiftyone/teams-components';
import {
  DatasetExportFormatsQuery,
  DatasetSnapshotExportFormatsQuery
} from '@fiftyone/teams-state';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useLazyLoadQuery } from 'react-relay';

export default function LabelFormatSelection() {
  const router = useRouter();
  const { slug, snapshot } = router.query;
  const { format, setFormat, hasMedia } = useExportView();
  const exportFormatsResponse = useLazyLoadQuery(
    snapshot ? DatasetSnapshotExportFormatsQuery : DatasetExportFormatsQuery,
    {
      datasetIdentifier: slug as string,
      snapshot: snapshot as string,
      includeMedia: hasMedia
    }
  );
  const computedExportFormats = useMemo(() => {
    const datasetOrSnapshot = snapshot
      ? exportFormatsResponse?.dataset?.snapshot
      : exportFormatsResponse?.dataset;
    const { exportFormats = [] } = datasetOrSnapshot || {};
    return exportFormats.map(({ name, displayName }) => ({
      id: name,
      label: displayName
    }));
  }, [exportFormatsResponse, snapshot]);

  return (
    <Selection
      label="Label format"
      items={computedExportFormats}
      value={format}
      selectProps={{
        fullWidth: true
      }}
      containerProps={{ sx: { mt: 1 } }}
      onChange={(selectedType) => {
        setFormat(selectedType);
      }}
    />
  );
}
