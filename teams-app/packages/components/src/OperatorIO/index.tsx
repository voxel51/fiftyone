import { ThemeProvider } from '@fiftyone/components';
import { operatorToIOSchema } from '@fiftyone/core/src/plugins/OperatorIO/utils';
import { SchemaIOComponent } from '@fiftyone/core/src/plugins/SchemaIO';
import { BaseStylesProvider } from '@fiftyone/operators/src/styled-components';

export default function OperatorIO(props: OperatorIOPropsType) {
  const { isOutput, data, readOnly, property } = props;
  const oSchema = operatorToIOSchema(property, { isOutput, readOnly });

  return (
    <ThemeProvider>
      <BaseStylesProvider>
        <SchemaIOComponent schema={oSchema} data={data} />
      </BaseStylesProvider>
    </ThemeProvider>
  );
}

type OperatorIOPropsType = {
  property: unknown;
  data?: unknown;
  isOutput?: boolean;
  readOnly?: boolean;
};
