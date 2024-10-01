import { useExportView } from '@fiftyone/hooks';
import { Selection } from '@fiftyone/teams-components';
import {
  DatasetExportFieldsQuery,
  DatasetExportFormatsQuery,
  DatasetSnapshotExportFieldsQuery,
  DatasetSnapshotExportFormatsQuery
} from '@fiftyone/teams-state';
import { useRouter } from 'next/router';
import { useEffect, useMemo } from 'react';
import { useLazyLoadQuery } from 'react-relay';

export default function FieldSelection() {
  const router = useRouter();
  const { slug, snapshot } = router.query;
  const { format, field, setField, setFieldsAvailable, hasMedia } =
    useExportView();
  const exportFormatsResponse = useLazyLoadQuery(
    snapshot ? DatasetSnapshotExportFormatsQuery : DatasetExportFormatsQuery,
    {
      datasetIdentifier: slug as string,
      snapshot: snapshot as string,
      includeMedia: hasMedia
    }
  );
  const exportFieldsResponse = useLazyLoadQuery(
    snapshot ? DatasetSnapshotExportFieldsQuery : DatasetExportFieldsQuery,
    {
      datasetIdentifier: slug as string,
      snapshot: snapshot as string,
      exportFormat: format
    },
    { networkCacheConfig: { force: false } }
  );
  const computedExportFields = useMemo(() => {
    const datasetOrSnapshot = snapshot
      ? exportFieldsResponse?.dataset?.snapshot
      : exportFieldsResponse?.dataset;
    const { exportFields = [] } = datasetOrSnapshot || {};
    return exportFields.map((field) => ({ id: field, label: field }));
  }, [exportFieldsResponse, snapshot]);
  const exportFormat = useMemo(() => {
    const { exportFormats = [] } = exportFormatsResponse?.dataset || {};
    return exportFormats.find(({ name }) => name === format);
  }, [format, exportFormatsResponse]);

  useEffect(() => {
    setFieldsAvailable(computedExportFields);
  }, [computedExportFields]);

  if (computedExportFields.length === 0) return null;

  return (
    <Selection
      key={format}
      label="Field"
      items={computedExportFields}
      value={field}
      selectProps={{
        fullWidth: true,
        multiple: exportFormat?.allowMultiFieldSelect
      }}
      containerProps={{ sx: { mt: 1 } }}
      onChange={(field) => {
        setField(field);
      }}
    />
  );
}
