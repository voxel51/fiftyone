import AutoComplete from "./AutoComplete";
import CheckboxWidget from "./CheckboxWidget";
import Dropdown from "./Dropdown";
import RadioWidget from "./RadioWidget";
import SliderWidget from "./SliderWidget";
import TextWidget from "./TextWidget";
import ToggleWidget from "./ToggleWidget";

export default {
  AutoComplete,
  Dropdown,
  RangeWidget: SliderWidget,
  TextWidget,
  BooleanWidget: ToggleWidget,
  CheckboxWidget,
  radio: RadioWidget,
};
