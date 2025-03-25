from textwrap import dedent
import fiftyone.core.fields as fof

# NOTE: copied from NativeModelEval
KEY_COLOR = "#ff6d04"
COMPARE_KEY_COLOR = "#03a9f4"

MAX_CATEGORIES = 100
ALLOWED_BY_TYPES = (
    fof.StringField,
    fof.BooleanField,
    fof.IntField,
    fof.FloatField,
)

SCENARIO_BUILDING_CHOICES = [
    {
        "type": "sample_field",
        "label": "Select sample fields",
        "icon": "add_card_outlined",
    },
    {
        "type": "label_attribute",
        "label": "Select label attributes",
        "icon": "add_card_outlined",
    },
    {
        "type": "view",
        "label": "Select saved views",
        "icon": "create_new_folder_outlined",
    },
    {
        "type": "custom_code",
        "label": "Custom code",
        "icon": "code_outlined",
    },
]


def get_scenario_example(scenario_name="brightness"):
    examples = {
        "brightness": dedent(
            """
            from fiftyone import ViewField as F
            subsets = {
                "Bright objects": [
                    dict(type="field", field="tags", value="test"),
                    dict(type="field", expr=F("brightness") > 0.5),
                ],
                "Dark objects": [
                    dict(type="field", field="tags", value="test"),
                    dict(type="field", expr=F("brightness") < 0.5),
                ]
            }
        """
        ).strip(),
        "fashion_10000": dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "throne": dict(type="field", field="predictions.label", value="throne"),
                "chain": dict(type="field", field="predictions.label", value="chain"),
            }
        """
        ).strip(),
        "scenario_1": dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "sunny": dict(type="field", field="tags", value="sunny"),
                "cloudy": dict(type="field", field="tags", value="cloudy"),
                "rainy": dict(type="field", field="tags", value="rainy"),
                "Sunny unique objects": [
                    dict(type="field", field="tags", value="sunny"),
                    dict(type="field", expr=F("uniqueness") > 0.75),
                ],
                "Rainy common objects": [
                    dict(type="field", field="tags", value="rainy"),
                    dict(type="field", expr=F("uniqueness") < 0.25),
                ]
            }
        """
        ).strip(),
        "scenario_2": dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "Low": {"field": F($FIELD) < 0.25},
                "middle": {"field": F($FIELD) >= 0.25 & F($FIELD) < 0.75},
                "high": {"field": F($FIELD) > 0.75},
            }
        """
        ).strip(),
        "scenario_3": dedent(
            """
            from fiftyone import ViewField as F

            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
            subsets = {
                "Small objects": dict(type="attribute", expr=bbox_area <= 0.05),
                "Medium objects": dict(type="attribute", expr=(0.05 <= bbox_area) & (bbox_area <= 0.5)),
                "Large objects": dict(type="attribute", expr=bbox_area > 0.5),
            }
        """
        ).strip(),
        "scenario_4": dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "Sunny unique objects": [
                    dict(type="field", field="tags", value="sunny"),
                    dict(type="field", expr=F("uniqueness") > 0.75),
                ],
                "Rainy common objects": [
                    dict(type="field", field="tags", value="rainy"),
                    dict(type="field", expr=F("uniqueness") < 0.25),
                ]
            }
        """
        ).strip(),
    }
    return examples.get(scenario_name, "")
