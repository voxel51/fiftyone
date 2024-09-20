import {
  AWSIcon,
  AzureIcon,
  GCPIcon,
  MinIOIcon
} from '@fiftyone/teams-components';

const providerToIcon = {
  AWS: AWSIcon,
  GCP: GCPIcon,
  AZURE: AzureIcon,
  MINIO: MinIOIcon
};

export default function ProviderIcon(props: ProviderIconProps) {
  const Icon = providerToIcon[props.provider];
  return <Icon sx={{ fontSize: 24, verticalAlign: 'bottom', width: 24 }} />;
}

type ProviderIconProps = {
  provider: 'AZURE' | 'AWS' | 'GCP' | 'MINIO';
};
