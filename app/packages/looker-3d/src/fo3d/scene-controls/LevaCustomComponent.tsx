/**
 * This component allows us to use custom components in the Leva UI.
 * This is useful when none of the input types in Leva are sufficient.
 */
import {
  Components,
  createPlugin,
  LevaInputProps,
  useInputContext,
} from "leva/plugin";

const { Row, Label } = Components;

type CustomComponentSettings = {
  component: React.ReactNode;
};

type CustomComponentType = number;

type CustomComponentInput = CustomComponentSettings;

type CustomComponentProps = LevaInputProps<
  CustomComponentType,
  CustomComponentSettings,
  CustomComponentInput
>;

const CustomComponentPlugin = () => {
  const { label, settings } = useInputContext<CustomComponentProps>();
  const { component } = settings;

  return (
    <Row input>
      <Label>{label}</Label>
      {component}
    </Row>
  );
};

const normalize = (input: CustomComponentInput) => {
  const { component } = input;
  return {
    value: 0,
    settings: { component },
  };
};

export const customComponent = createPlugin({
  component: CustomComponentPlugin,
  normalize,
});
