"""
FiftyOne annotation ontology validation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.annotation.attributes import (
    AttributeSpec,
    When,
    WhenAnd,
    WhenEquals,
    WhenOperator,
    WhenOr,
)
from fiftyone.core.ontology import AnnotationOntology
from fiftyone.core.ontology_validation import validate_annotation_ontology


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
                    when=w,
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_rejects_invalid_operator_nested_inside_and_group(self):
        # collect_leaf_conditions must recurse into WhenAnd to expose the
        # mutated leaf; the group itself has no operator to validate.
        bad_leaf = When(WhenOperator.EQUALS, field="flag", value=True)
        bad_leaf.operator = "mock_operator"
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag", type="bool", component="checkbox"),
                AttributeSpec(
                    name="location",
                    type="str",
                    component="dropdown",
                    when=WhenAnd(
                        [
                            WhenEquals(field="flag", value=True),
                            bad_leaf,
                        ]
                    ),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_rejects_invalid_operator_nested_inside_or_group(self):
        bad_leaf = When(WhenOperator.EQUALS, field="flag", value=True)
        bad_leaf.operator = "mock_operator"
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag", type="bool", component="checkbox"),
                AttributeSpec(
                    name="location",
                    type="str",
                    component="dropdown",
                    when=WhenOr(
                        [
                            WhenEquals(field="flag", value=True),
                            bad_leaf,
                        ]
                    ),
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
                    when=WhenEquals(field="b", value="x"),
                ),
                AttributeSpec(
                    name="b",
                    type="str",
                    component="dropdown",
                    when=WhenEquals(field="a", value="y"),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_rejects_cycle_through_overwritten_variant(self):
        # A multi-variant attribute (same `name`, different `when`)
        # used to lose its edges when a later same-name variant
        # overwrote it in the cycle graph. The edges from every variant
        # must contribute, otherwise a cycle through the dropped variant
        # goes silently unreported.
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(
                    name="a",
                    type="str",
                    component="dropdown",
                    when=WhenEquals(field="b", value="x"),
                ),
                # Same-name variant with no `when` — would have erased
                # the cyclic edge from the first variant under the old
                # graph-build code.
                AttributeSpec(name="a", type="str", component="dropdown"),
                AttributeSpec(
                    name="b",
                    type="str",
                    component="dropdown",
                    when=WhenEquals(field="a", value="y"),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_rejects_cycle_where_edge_is_inside_and_group(self):
        # collect_leaf_conditions must traverse into WhenAnd so both
        # leaf field references contribute edges to the cycle graph.
        # Cycle: a → {b, c} (via WhenAnd), c → a (back-edge).
        cycle_attr_a = "a"
        cycle_attr_b = "b"
        cycle_attr_c = "c"
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(
                    name=cycle_attr_a,
                    type="str",
                    component="dropdown",
                    when=WhenAnd(
                        [
                            WhenEquals(field=cycle_attr_b, value="x"),
                            WhenEquals(field=cycle_attr_c, value="y"),
                        ]
                    ),
                ),
                AttributeSpec(
                    name=cycle_attr_b,
                    type="str",
                    component="dropdown",
                ),
                AttributeSpec(
                    name=cycle_attr_c,
                    type="str",
                    component="dropdown",
                    when=WhenEquals(field=cycle_attr_a, value="z"),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_rejects_cycle_where_edge_is_inside_or_group(self):
        # Same as above but the back-edge lives inside a WhenOr.
        # Cycle: a → {b, c} (via WhenOr), c → a (back-edge).
        cycle_attr_a = "a"
        cycle_attr_b = "b"
        cycle_attr_c = "c"
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(
                    name=cycle_attr_a,
                    type="str",
                    component="dropdown",
                    when=WhenOr(
                        [
                            WhenEquals(field=cycle_attr_b, value="x"),
                            WhenEquals(field=cycle_attr_c, value="y"),
                        ]
                    ),
                ),
                AttributeSpec(
                    name=cycle_attr_b,
                    type="str",
                    component="dropdown",
                ),
                AttributeSpec(
                    name=cycle_attr_c,
                    type="str",
                    component="dropdown",
                    when=WhenEquals(field=cycle_attr_a, value="z"),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_accepts_valid_acyclic_and_group(self):
        # A WhenAnd with two unrelated field references is not a cycle.
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag1", type="bool", component="checkbox"),
                AttributeSpec(name="flag2", type="bool", component="checkbox"),
                AttributeSpec(
                    name="detail",
                    type="str",
                    component="dropdown",
                    when=WhenAnd(
                        [
                            WhenEquals(field="flag1", value=True),
                            WhenEquals(field="flag2", value=True),
                        ]
                    ),
                ),
            ],
        )
        # Should not raise
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
                    when=w,
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_accepts_then_with_allowed_keys(self):
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(
                    name="vehicle_type", type="str", component="dropdown"
                ),
                AttributeSpec(
                    name="model",
                    type="str",
                    component="dropdown",
                    when=WhenEquals(
                        field="vehicle_type",
                        value="car",
                        then={
                            "values": ["sedan", "suv"],
                            "component": "radio",
                        },
                    ),
                ),
            ],
        )
        # Should not raise
        validate_annotation_ontology(ao)

    def test_rejects_disallowed_then_key_inside_and_group(self):
        # collect_leaf_conditions must recurse into WhenAnd to surface
        # the bad `then` key on the nested leaf.
        bad_leaf = WhenEquals(
            field="other", value=True, then={"name": "renamed"}
        )
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag", type="bool", component="checkbox"),
                AttributeSpec(name="other", type="bool", component="checkbox"),
                AttributeSpec(
                    name="attr",
                    type="str",
                    component="dropdown",
                    when=WhenAnd(
                        [
                            WhenEquals(field="flag", value=True),
                            bad_leaf,
                        ]
                    ),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_rejects_disallowed_then_key_inside_or_group(self):
        bad_leaf = WhenEquals(field="other", value=True, then={"type": "int"})
        ao = AnnotationOntology(
            name="test",
            attributes=[
                AttributeSpec(name="flag", type="bool", component="checkbox"),
                AttributeSpec(name="other", type="bool", component="checkbox"),
                AttributeSpec(
                    name="attr",
                    type="str",
                    component="dropdown",
                    when=WhenOr(
                        [
                            WhenEquals(field="flag", value=True),
                            bad_leaf,
                        ]
                    ),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)


class TaxonomyRefValidTests(unittest.TestCase):
    """Validates ``AnnotationOntology.taxonomy`` resolves to a saved
    Taxonomy. DB-touching since ``load_ontology`` is the resolver.
    """

    def setUp(self):
        import fiftyone.core.odm as foo
        from fiftyone.core.odm.ontology import OntologyDocument

        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        OntologyDocument.ensure_indexes()

    def tearDown(self):
        import fiftyone.core.odm as foo

        foo.get_db_conn().drop_collection("ontologies")

    def test_no_taxonomy_ref_is_ok(self):
        ao = AnnotationOntology(name="ao_no_tax")
        validate_annotation_ontology(ao)

    def test_valid_taxonomy_ref_resolves(self):
        from fiftyone.core.annotation.nodes import Node
        from fiftyone.core.ontology import Taxonomy

        tax = Taxonomy(
            name="vehicle_classes",
            root=Node(name="root", values=[Node(name="car")]),
        )
        tax.save()

        ao = AnnotationOntology(name="ao_with_tax", taxonomy=tax)
        validate_annotation_ontology(ao)

    def test_dangling_taxonomy_ref_raises(self):
        # Constructed with a valid Taxonomy, then the Taxonomy is deleted
        # behind the AO's back — the saved slug is now dangling.
        ao = AnnotationOntology(name="ao_dangling")
        ao.taxonomy = "does_not_exist"
        with self.assertRaises(ValueError):
            validate_annotation_ontology(ao)

    def test_wrong_type_taxonomy_ref_raises(self):
        AnnotationOntology(name="some_other_ao").save()

        ao = AnnotationOntology(name="ao_wrong_type")
        ao.taxonomy = "some_other_ao"
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
                    when=WhenEquals(field="b", value="x"),
                ),
                AttributeSpec(
                    name="b",
                    type="str",
                    component="dropdown",
                    when=WhenEquals(field="a", value="y"),
                ),
            ],
        )
        with self.assertRaises(ValueError):
            ao.save()


if __name__ == "__main__":
    unittest.main()
