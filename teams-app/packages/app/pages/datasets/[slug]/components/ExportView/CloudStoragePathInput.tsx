import { useExportView } from '@fiftyone/hooks';
import { TextInput } from '@fiftyone/teams-components';

export default function CloudStoragePathInput() {
  const { setCloudStoragePath, path } = useExportView();

  return (
    <TextInput
      fieldLabel="Cloud storage path"
      fullWidth
      size="small"
      value={path}
      onChange={(e) => {
        setCloudStoragePath(e.target.value);
      }}
      placeholder="s3://bucket/some/path"
    />
  );
}
