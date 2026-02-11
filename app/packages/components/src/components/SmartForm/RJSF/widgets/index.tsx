import AutoComplete from "./AutoComplete";
import CheckboxWidget from "./CheckboxWidget";
import Dropdown from "./Dropdown";
import LabelValueWidget from "./LabelValueWidget";
import RadioWidget from "./RadioWidget";
import SelectWidget from "./SelectWidget";
import SliderWidget from "./SliderWidget";
import TextWidget from "./TextWidget";
import ToggleWidget from "./ToggleWidget";

export default {
  AutoComplete,
  Dropdown,
  LabelValueWidget,
  SelectWidget,
  RangeWidget: SliderWidget,
  TextWidget,
  BooleanWidget: ToggleWidget,
  CheckboxWidget,
  radio: RadioWidget,
};
