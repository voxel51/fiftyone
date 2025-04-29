import unittest
from unittest.mock import MagicMock, patch
from plugins.operators.model_evaluation import ConfigureScenario


class TestConfigureScenarios(unittest.TestCase):
    def setUp(self):
        self.operator = ConfigureScenario()

    @patch.object(ConfigureScenario, "get_scenario_names")
    def test_render_name_input_duplicate_name(self, mock_get_scenario_names):
        # Mock return value for get_scenario_names
        mock_get_scenario_names.return_value = [
            "DuplicateScenario",
            "OtherScenario",
        ]

        # # Create a fake context with params
        # mock_ctx = MagicMock()
        # mock_ctx.params = {
        #     "scenario_name": "DuplicateScenario",  # Already exists
        #     # no 'scenario_id', so not edit mode
        # }

        # # Create a mock for inputs
        # mock_inputs = MagicMock()

        # # Call the method
        # self.operator.render_name_input(mock_ctx, mock_inputs)

        # # Validate inputs.str() was called with invalid=True and correct error message
        # mock_inputs.str.assert_called_once()
        # _, kwargs = mock_inputs.str.call_args
        # self.assertEqual(kwargs["invalid"], True)
        # self.assertEqual(
        #     kwargs["error_message"], "Scenario name already exists"
        # )
