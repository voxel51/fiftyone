import AutoComplete from "./AutoComplete";
import CheckboxWidget from "./CheckboxWidget";
import CheckboxesWidget from "./CheckboxesWidget";
import DatePickerWidget from "./DatePickerWidget";
import Dropdown from "./Dropdown";
import JsonEditorWidget from "./JsonEditorWidget";
import LabelValueWidget from "./LabelValueWidget";
import RadioWidget from "./RadioWidget";
import SelectWidget from "./SelectWidget";
import SliderWidget from "./SliderWidget";
import TaxonomyWidget from "./TaxonomyWidget";
import TextWidget from "./TextWidget";
import ToggleWidget from "./ToggleWidget";

export default {
  AutoComplete,
  DatePickerWidget,
  Dropdown,
  JsonEditorWidget,
  LabelValueWidget,
  SelectWidget,
  TaxonomyWidget,
  RangeWidget: SliderWidget,
  TextWidget,
  BooleanWidget: ToggleWidget,
  CheckboxWidget,
  checkboxes: CheckboxesWidget,
  radio: RadioWidget,
};
