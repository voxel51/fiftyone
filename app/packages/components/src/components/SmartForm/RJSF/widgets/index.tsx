import AutoComplete from "./AutoComplete";
import CheckboxWidget from "./CheckboxWidget";
import DatePickerWidget from "./DatePickerWidget";
import Dropdown from "./Dropdown";
import JsonEditorWidget from "./JsonEditorWidget";
import LabelValueWidget from "./LabelValueWidget";
import RadioWidget from "./RadioWidget";
import SelectWidget from "./SelectWidget";
import SliderWidget from "./SliderWidget";
import TextWidget from "./TextWidget";
import ToggleWidget from "./ToggleWidget";

export default {
  AutoComplete,
  DatePickerWidget,
  Dropdown,
  JsonEditorWidget,
  LabelValueWidget,
  SelectWidget,
  RangeWidget: SliderWidget,
  TextWidget,
  BooleanWidget: ToggleWidget,
  CheckboxWidget,
  radio: RadioWidget,
};
