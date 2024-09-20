import { ThemeProvider } from '@fiftyone/components';
import { BaseStylesProvider } from '@fiftyone/operators/src/styled-components';
import { getType } from '@fiftyone/teams-utilities';
import { useTheme } from '@mui/material';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const DynamicJSONView = dynamic(
  import('@fiftyone/core/src/plugins/SchemaIO/components/JSONView'),
  { ssr: false }
);

export default function JSONView(props: JSONViewPropsType) {
  const { content, collapsed } = props;
  const theme = useTheme();

  const json =
    getType(content) === 'string' ? JSON.parse(content as string) : content;

  return (
    <ThemeProvider>
      <BaseStylesProvider>
        <Suspense>
          <DynamicJSONView
            data={json}
            schema={{
              view: {
                componentsProps: {
                  json: {
                    collapsed,
                    style: {
                      padding: '1rem',
                      maxHeight: '50vh',
                      overflow: 'auto',
                      background: theme.palette.background.primary
                    }
                  }
                }
              }
            }}
          />
        </Suspense>
      </BaseStylesProvider>
    </ThemeProvider>
  );
}

type JSONViewPropsType = {
  content: string | object;
  collapsed?: boolean | number;
};
