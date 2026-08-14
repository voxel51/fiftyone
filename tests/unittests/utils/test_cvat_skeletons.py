"""
CVAT skeleton import unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import math
import unittest

import fiftyone.utils.cvat as fouc


def _svg(nodes):
    """Builds a minimal CVAT skeleton ``svg`` from ``(node_id, label_id)``."""
    return "".join(
        '<circle r="0.75" cx="1" cy="2" data-type="element node" '
        'data-element-id="%d" data-node-id="%d" data-label-id="%d"></circle>'
        % (node_id, node_id, label_id)
        for node_id, label_id in nodes
    )


def _element(label_id, points, outside=False):
    return {
        "label_id": label_id,
        "type": "points",
        "points": points,
        "outside": outside,
        "occluded": False,
    }


class SkeletonNodeOrderTests(unittest.TestCase):
    def test_order_from_svg(self):
        label = {
            "id": 1,
            "type": "skeleton",
            "svg": _svg([(1, 20), (2, 21), (3, 22)]),
            "sublabels": [{"id": 22}, {"id": 20}, {"id": 21}],
        }
        # svg node order wins over the sublabels list
        self.assertEqual(fouc._parse_skeleton_node_order(label), [20, 21, 22])

    def test_svg_node_ids_not_in_document_order(self):
        label = {
            "id": 1,
            "type": "skeleton",
            "svg": _svg([(3, 22), (1, 20), (2, 21)]),
            "sublabels": [],
        }
        self.assertEqual(fouc._parse_skeleton_node_order(label), [20, 21, 22])

    def test_partial_svg_keeps_uncovered_sublabels(self):
        # The svg describes only 2 of the 3 declared nodes; the uncovered one
        # must still get an index rather than being dropped
        label = {
            "id": 1,
            "type": "skeleton",
            "svg": _svg([(2, 21), (1, 20)]),
            "sublabels": [{"id": 20}, {"id": 21}, {"id": 22}],
        }
        self.assertEqual(fouc._parse_skeleton_node_order(label), [20, 21, 22])

    def test_partial_svg_does_not_duplicate(self):
        label = {
            "id": 1,
            "type": "skeleton",
            "svg": _svg([(1, 20), (2, 21)]),
            "sublabels": [{"id": 21}, {"id": 20}],
        }
        order = fouc._parse_skeleton_node_order(label)
        self.assertEqual(order, [20, 21])
        self.assertEqual(len(order), len(set(order)))

    def test_svg_node_missing_from_sublabels_is_kept(self):
        label = {
            "id": 1,
            "type": "skeleton",
            "svg": _svg([(1, 20), (2, 99)]),
            "sublabels": [{"id": 20}],
        }
        self.assertEqual(fouc._parse_skeleton_node_order(label), [20, 99])

    def test_falls_back_to_sublabels(self):
        label = {
            "id": 1,
            "type": "skeleton",
            "svg": None,
            "sublabels": [{"id": 20}, {"id": 21}],
        }
        self.assertEqual(fouc._parse_skeleton_node_order(label), [20, 21])

    def test_no_order_available(self):
        label = {"id": 1, "type": "skeleton", "svg": "", "sublabels": []}
        self.assertIsNone(fouc._parse_skeleton_node_order(label))


class FlattenSkeletonPointsTests(unittest.TestCase):
    def test_reorders_elements_to_node_order(self):
        # CVAT does not guarantee element order; here it is rotated
        elements = [
            _element(22, [5.0, 6.0]),
            _element(20, [1.0, 2.0]),
            _element(21, [3.0, 4.0]),
        ]
        points = fouc._flatten_skeleton_points(elements, [20, 21, 22])
        self.assertEqual(points, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0])

    def test_outside_element_becomes_nan(self):
        elements = [
            _element(20, [1.0, 2.0], outside=True),
            _element(21, [3.0, 4.0]),
        ]
        points = fouc._flatten_skeleton_points(elements, [20, 21])
        self.assertTrue(math.isnan(points[0]))
        self.assertTrue(math.isnan(points[1]))
        self.assertEqual(points[2:], [3.0, 4.0])

    def test_missing_element_becomes_nan(self):
        # A node in the skeleton definition with no element at all still
        # occupies its index so that indexes stay aligned across shapes
        elements = [_element(21, [3.0, 4.0])]
        points = fouc._flatten_skeleton_points(elements, [20, 21, 22])
        self.assertEqual(len(points), 6)
        self.assertTrue(math.isnan(points[0]))
        self.assertEqual(points[2:4], [3.0, 4.0])
        self.assertTrue(math.isnan(points[4]))

    def test_unknown_sublabel_is_dropped(self):
        elements = [_element(20, [1.0, 2.0]), _element(99, [9.0, 9.0])]
        points = fouc._flatten_skeleton_points(elements, [20])
        self.assertEqual(points, [1.0, 2.0])

    def test_without_node_order_preserves_given_order(self):
        elements = [_element(22, [5.0, 6.0]), _element(20, [1.0, 2.0])]
        points = fouc._flatten_skeleton_points(elements, None)
        self.assertEqual(points, [5.0, 6.0, 1.0, 2.0])

    def test_without_node_order_still_honors_outside(self):
        elements = [_element(20, [1.0, 2.0], outside=True)]
        points = fouc._flatten_skeleton_points(elements, None)
        self.assertTrue(all(math.isnan(p) for p in points))

    def test_no_elements_yields_all_nan(self):
        # `_parse_annotation` skips element-less skeletons before reaching
        # here, but every node keeps its index if it ever does
        points = fouc._flatten_skeleton_points([], [20, 21])
        self.assertEqual(len(points), 4)
        self.assertTrue(all(math.isnan(p) for p in points))

    def test_no_elements_and_no_node_order(self):
        self.assertEqual(fouc._flatten_skeleton_points([], None), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
