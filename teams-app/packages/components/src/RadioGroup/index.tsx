import {
  FormControl,
  RadioGroup as RadioGroupMUI,
  FormControlLabel,
  Radio,
  RadioGroupProps,
  FormControlProps,
} from "@mui/material";

export default function RadioGroup(props: RadioGroupPropsType) {
  const { items, formControlProps = {}, ...otherProps } = props;
  const defaultValue = items?.[0].value;

  return (
    <FormControl {...formControlProps}>
      <RadioGroupMUI defaultValue={defaultValue} {...otherProps}>
        {items.map(({ value, label }) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio />}
            label={label ?? value}
          />
        ))}
      </RadioGroupMUI>
    </FormControl>
  );
}

type RadioGroupPropsType = RadioGroupProps & {
  items: Array<{ value: string; label?: string }>;
  formControlProps?: FormControlProps;
};
