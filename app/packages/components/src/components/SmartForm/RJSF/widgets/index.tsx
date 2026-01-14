import AutoComplete from "./AutoComplete";
import CheckboxWidget from "./CheckboxWidget";
import Dropdown from "./Dropdown";
import RadioWidget from "./RadioWidget";
import Slider from "./Slider";
import TextWidget from "./TextWidget";
import ToggleWidget from "./ToggleWidget";

export default {
  AutoComplete,
  Dropdown,
  RangeWidget: Slider,
  TextWidget,
  BooleanWidget: ToggleWidget,
  CheckboxWidget,
  radio: RadioWidget,
};
