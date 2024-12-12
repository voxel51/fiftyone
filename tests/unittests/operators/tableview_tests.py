import unittest

from fiftyone.operators.types import TableView


class TableViewTests(unittest.TestCase):
    def test_table_view_basic(self):
        table = TableView()
        table.add_column("column1", label="Column 1")
        table.add_column("column2", label="Column 2")
        assert table.keys() == ["column1", "column2"]

        with self.assertRaises(ValueError):
            table.add_column("column1", label="Column 3")

        mock_on_click = lambda: None

        table.add_row_action(
            "action1",
            on_click=mock_on_click,
            icon="icon1",
            color="primary",
            tooltip="Action 1",
        )
        table.add_row_action(
            "action2",
            on_click=mock_on_click,
            icon="icon2",
            color="secondary",
            tooltip="Action 2",
        )

        with self.assertRaises(ValueError):
            table.add_row_action(
                "action1",
                on_click=mock_on_click,
                icon="icon3",
                color="primary",
                tooltip="Action 3",
            )

        table.add_tooltip(1, 1, "Tooltip 1")
        table.add_tooltip(1, 2, "Tooltip 2")

        with self.assertRaises(ValueError):
            table.add_tooltip(1, 1, "Tooltip 3")
