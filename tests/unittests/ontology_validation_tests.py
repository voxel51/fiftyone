"""
FiftyOne annotation ontology validation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import unittest

# Ontology SDK is gated by VFF_ONTOLOGY_CA; enable for the whole module.
os.environ.setdefault("VFF_ONTOLOGY_CA", "1")

from fiftyone.core.annotation.attributes import (
    AttributeSpec,
    When,
    WhenOperator,
)
from fiftyone.core.ontology import AnnotationOntology
from fiftyone.core.ontology_validation import validate_annotation_ontology


class UniqueAttributeNamesTests(unittest.TestCase):
    def test_rejects_duplicate_names(self):
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="damage", type="str", component="dropdown"),
                AttributeSpec(
                    name="damage", type="bool", component="checkbox"
                ),
            ],
        )
        with self.assertRaises(ValueError) as cm:
            validate_annotation_ontology(ao)
        self.assertIn("damage", str(cm.exception))

    def test_accepts_empty_attributes(self):
        ao = AnnotationOntology(name="empty")
        validate_annotation_ontology(ao)


class OperatorValidTests(unittest.TestCase):
    def test_rejects_invalid_operator_on_mutated_when(self):
        # Safety net for direct mutation past __post_init__.
        w = When(WhenOperator.EQUALS, field="flag", value=True)
        w.operator = "mock_operator"
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag", type="bool", component="checkbox"),
                AttributeSpec(
                    name="location",
                    type="str",
                    component="dropdown",
                    when=[w],
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)


class TypeValidTests(unittest.TestCase):
    def test_rejects_unsupported_type(self):
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(
                    name="mock_attr", type="mock_type", component="text"
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)


class ComponentCompatibleTests(unittest.TestCase):
    def test_rejects_component_invalid_for_type(self):
        # bool accepts checkbox/toggle only; dropdown is invalid
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag", type="bool", component="dropdown"),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)


class NoCyclesTests(unittest.TestCase):
    def test_rejects_cycle_between_attributes(self):
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(
                    name="a",
                    type="str",
                    component="dropdown",
                    when=[When(WhenOperator.EQUALS, field="b", value="x")],
                ),
                AttributeSpec(
                    name="b",
                    type="str",
                    component="dropdown",
                    when=[When(WhenOperator.EQUALS, field="a", value="y")],
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)


class ThenKeysValidTests(unittest.TestCase):
    def test_rejects_then_with_disallowed_key(self):
        w = When(
            WhenOperator.EQUALS,
            field="other",
            value=True,
            then={"name": "renamed"},
        )
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="other", type="bool", component="checkbox"),
                AttributeSpec(
                    name="attr",
                    type="str",
                    component="dropdown",
                    when=[w],
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)


class SaveInvokesValidationTests(unittest.TestCase):
    def test_save_invokes_validation(self):
        # Auto-validate hook in Ontology.save() — invalid ontologies
        # raise before any DB interaction.
        ao = AnnotationOntology(
            name="bad",
            attributes=[
                AttributeSpec(
                    name="a",
                    type="str",
                    component="dropdown",
                    when=[When(WhenOperator.EQUALS, field="b", value="x")],
                ),
                AttributeSpec(
                    name="b",
                    type="str",
                    component="dropdown",
                    when=[When(WhenOperator.EQUALS, field="a", value="y")],
                ),
            ],
        )
        with self.assertRaises(ValueError):
            ao.save()


if __name__ == "__main__":
    unittest.main()
