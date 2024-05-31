import unittest

import numpy as np

from fiftyone.core.threed.transformation import Vector3


def _none_check(tester, obj, attribute, nullable):
    if nullable:
        setattr(obj, attribute, None)
        tester.assertIsNone(getattr(obj, attribute))
    else:
        tester.assertRaises(ValueError, setattr, obj, attribute, None)


def assert_bool_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    tester.assertRaises(ValueError, setattr, obj, attribute, 1)
    tester.assertRaises(ValueError, setattr, obj, attribute, "true")
    tester.assertRaises(ValueError, setattr, obj, attribute, "1")

    _none_check(tester, obj, attribute, nullable)
    setattr(obj, attribute, True)
    tester.assertEqual(getattr(obj, attribute), True)
    setattr(obj, attribute, False)
    tester.assertEqual(getattr(obj, attribute), False)


def assert_choice_prop(
    tester: unittest.TestCase, obj, attribute, choices: list, nullable=False
):
    tester.assertRaises(ValueError, setattr, obj, attribute, "blah")
    tester.assertRaises(ValueError, setattr, obj, attribute, 8675309)
    _none_check(tester, obj, attribute, nullable)

    for choice in choices:
        setattr(obj, attribute, choice)
        tester.assertEqual(getattr(obj, attribute), choice)


def assert_color_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    # Validation errors
    tester.assertRaises(ValueError, setattr, obj, attribute, "000000")
    tester.assertRaises(ValueError, setattr, obj, attribute, "#00001")
    tester.assertRaises(ValueError, setattr, obj, attribute, "#10000g")
    tester.assertRaises(ValueError, setattr, obj, attribute, "#GGGFFF")
    tester.assertRaises(ValueError, setattr, obj, attribute, "0xGGGFFF")
    tester.assertRaises(ValueError, setattr, obj, attribute, "majesticunknown")

    _none_check(tester, obj, attribute, nullable)

    # Happy path
    setattr(obj, attribute, "#ff6D04")
    tester.assertEqual(getattr(obj, attribute), "#ff6d04")
    setattr(obj, attribute, "0xff6D04")
    tester.assertEqual(getattr(obj, attribute), "0xff6d04")
    setattr(obj, attribute, "red")
    tester.assertEqual(getattr(obj, attribute), "red")


def assert_float_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    tester.assertRaises(ValueError, setattr, obj, attribute, "blah")

    _none_check(tester, obj, attribute, nullable)

    setattr(obj, attribute, 51.51)
    tester.assertEqual(getattr(obj, attribute), 51.51)


def assert_string_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    _none_check(tester, obj, attribute, nullable)

    setattr(obj, attribute, "test string")
    tester.assertEqual(getattr(obj, attribute), "test string")


def assert_vec3_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    tester.assertRaises(ValueError, setattr, obj, attribute, "blah")
    tester.assertRaises(ValueError, setattr, obj, attribute, 1)
    tester.assertRaises(ValueError, setattr, obj, attribute, 2.0)
    tester.assertRaises(ValueError, setattr, obj, attribute, [1.0, 2.0])
    tester.assertRaises(
        ValueError, setattr, obj, attribute, [1.0, 2.0, 3.0, 4.0]
    )
    tester.assertRaises(
        ValueError, setattr, obj, attribute, [1.0, 2.0, "blah"]
    )

    _none_check(tester, obj, attribute, nullable)

    setattr(obj, attribute, [1.0, 2.0, 3.0])
    tester.assertEqual(getattr(obj, attribute), Vector3(1.0, 2.0, 3.0))
    setattr(obj, attribute, (3.0, 2.0, 1.0))
    tester.assertEqual(getattr(obj, attribute), Vector3(3.0, 2.0, 1.0))
    setattr(obj, attribute, np.array([1, 2, 3]))
    tester.assertEqual(getattr(obj, attribute), Vector3(1.0, 2.0, 3.0))
