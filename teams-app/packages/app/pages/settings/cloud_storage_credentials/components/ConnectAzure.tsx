import { BasicForm, Box, RoundedTabs } from '@fiftyone/teams-components';
import { HOW_TO_CONNECT_TO_AZURE_LINK } from '@fiftyone/teams-state/src/constants';
import { Link, Typography } from '@mui/material';
import { useState } from 'react';
import { COMMON_FIELDS, ConnectCloudStorageProps } from '../utils';

export default function ConnectAzure({ onChange }: ConnectCloudStorageProps) {
  const [tab, setTab] = useState('ini');

  return (
    <Box>
      <Typography variant="body1" sx={{ mb: 3 }}>
        FiftyOne can connect to Azure using one of the two methods below.
        Learn&nbsp;
        <Link href={HOW_TO_CONNECT_TO_AZURE_LINK} sx={{ fontWeight: 600 }}>
          how to connect to Azure
        </Link>
        &nbsp;in our docs.
      </Typography>
      <RoundedTabs
        tabs={[
          { label: 'INI file', id: 'ini' },
          { label: 'Account key', id: 'account_key' },
          {
            label: 'Connection string',
            id: 'connection_string',
            sx: { whiteSpace: 'nowrap' }
          },
          { label: 'Client secret', id: 'client_secret' }
        ]}
        onChange={setTab}
        selected={tab}
      />
      <Box pt={2}>
        {tab === 'ini' && (
          <BasicForm
            fields={[
              {
                type: 'file',
                id: 'ini-file',
                fieldProps: { caption: '.ini file only', types: '.ini' },
                required: true
              },
              ...COMMON_FIELDS
            ]}
            onChange={onChange}
          />
        )}
        {tab === 'account_key' && (
          <BasicForm
            fields={[
              {
                type: 'text',
                label: 'Account name',
                id: 'account_name',
                fieldProps: { placeholder: 'Account name' },
                required: true
              },
              {
                type: 'secret',
                label: 'Account key',
                id: 'account_key',
                fieldProps: { placeholder: 'Account key' },
                required: true
              },
              {
                type: 'text',
                label: 'Alias (optional)',
                id: 'alias',
                fieldProps: { placeholder: 'My alias' }
              },
              ...COMMON_FIELDS
            ]}
            onChange={onChange}
          />
        )}
        {tab === 'connection_string' && (
          <BasicForm
            fields={[
              {
                type: 'text',
                label: 'Connection string',
                id: 'conn_str',
                fieldProps: { placeholder: 'Connection string' },
                required: true
              },
              {
                type: 'text',
                label: 'Alias (optional)',
                id: 'alias',
                fieldProps: { placeholder: 'My alias' }
              },
              ...COMMON_FIELDS
            ]}
            onChange={onChange}
          />
        )}
        {tab === 'client_secret' && (
          <BasicForm
            fields={[
              {
                type: 'text',
                label: 'Account name',
                id: 'account_name',
                fieldProps: { placeholder: 'Account name' },
                required: true
              },
              {
                type: 'secret',
                label: 'Client ID',
                id: 'client_id',
                fieldProps: { placeholder: 'Client ID' },
                required: true
              },
              {
                type: 'secret',
                label: 'Client secret',
                id: 'secret',
                fieldProps: { placeholder: 'Client secret' },
                required: true
              },
              {
                type: 'text',
                label: 'Tenant ID',
                id: 'tenant',
                fieldProps: { placeholder: 'Tenant ID' },
                required: true
              },
              {
                type: 'text',
                label: 'Alias (optional)',
                id: 'alias',
                fieldProps: { placeholder: 'My alias' }
              },
              ...COMMON_FIELDS
            ]}
            onChange={onChange}
          />
        )}
      </Box>
    </Box>
  );
}
