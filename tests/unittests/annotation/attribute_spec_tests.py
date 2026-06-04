"""
AttributeSpec unit tests — taxonomy field support.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.annotation.attributes import AttributeSpec


class AttributeSpecTaxonomyTests(unittest.TestCase):
    """Tests for the ``taxonomy`` field on :class:`AttributeSpec`."""

    def _make_base(self, **overrides):
        defaults = {
            "name": "vehicle_make",
            "type": "str",
            "component": "dropdown",
        }
        defaults.update(overrides)
        return defaults

    # -- Construction --

    def test_taxonomy_only(self):
        spec = AttributeSpec(**self._make_base(taxonomy="vehicle_type"))
        self.assertEqual(spec.taxonomy, "vehicle_type")
        self.assertIsNone(spec.values)

    def test_values_only(self):
        spec = AttributeSpec(
            **self._make_base(values=["ford", "honda", "toyota"])
        )
        self.assertIsNone(spec.taxonomy)
        self.assertEqual(spec.values, ["ford", "honda", "toyota"])

    def test_neither_taxonomy_nor_values(self):
        spec = AttributeSpec(**self._make_base())
        self.assertIsNone(spec.taxonomy)
        self.assertIsNone(spec.values)

    def test_both_taxonomy_and_values_raises(self):
        with self.assertRaises(ValueError) as ctx:
            AttributeSpec(
                **self._make_base(
                    taxonomy="vehicle_type",
                    values=["ford", "honda"],
                )
            )
        self.assertIn("mutually exclusive", str(ctx.exception))

    def test_taxonomy_empty_string_raises(self):
        with self.assertRaises(ValueError) as ctx:
            AttributeSpec(**self._make_base(taxonomy=""))
        self.assertIn("non-empty string", str(ctx.exception))

    def test_taxonomy_non_string_raises(self):
        with self.assertRaises(ValueError) as ctx:
            AttributeSpec(**self._make_base(taxonomy=123))
        self.assertIn("non-empty string", str(ctx.exception))

    # -- to_dict round-trip --

    def test_to_dict_includes_taxonomy(self):
        spec = AttributeSpec(**self._make_base(taxonomy="vehicle_type"))
        d = spec.to_dict()
        self.assertEqual(d["taxonomy"], "vehicle_type")
        self.assertNotIn("values", d)

    def test_to_dict_omits_taxonomy_when_none(self):
        spec = AttributeSpec(**self._make_base(values=["ford", "honda"]))
        d = spec.to_dict()
        self.assertNotIn("taxonomy", d)
        self.assertEqual(d["values"], ["ford", "honda"])

    # -- from_dict round-trip --

    def test_from_dict_with_taxonomy(self):
        d = self._make_base(taxonomy="vehicle_type")
        spec = AttributeSpec.from_dict(d)
        self.assertEqual(spec.taxonomy, "vehicle_type")
        self.assertIsNone(spec.values)

    def test_from_dict_full_round_trip(self):
        original = AttributeSpec(**self._make_base(taxonomy="vehicle_type"))
        restored = AttributeSpec.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.type, original.type)
        self.assertEqual(restored.component, original.component)
        self.assertEqual(restored.taxonomy, original.taxonomy)
        self.assertIsNone(restored.values)

    def test_from_dict_taxonomy_empty_string_raises(self):
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict(self._make_base(taxonomy=""))

    def test_from_dict_taxonomy_non_string_raises(self):
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict(self._make_base(taxonomy=123))

    def test_from_dict_both_taxonomy_and_values_raises(self):
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict(
                self._make_base(
                    taxonomy="vehicle_type",
                    values=["ford", "honda"],
                )
            )


if __name__ == "__main__":
    unittest.main()
