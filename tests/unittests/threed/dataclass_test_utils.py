import unittest


def _none_check(tester, obj, attribute, nullable):
    if nullable:
        setattr(obj, attribute, None)
        tester.assertIsNone(getattr(obj, attribute))
    else:
        tester.assertRaises(ValueError, setattr, obj, attribute, None)


def assert_color_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    # Validation errors
    tester.assertRaises(ValueError, setattr, obj, attribute, "000000")
    tester.assertRaises(ValueError, setattr, obj, attribute, "#00001")
    tester.assertRaises(ValueError, setattr, obj, attribute, "#10000g")

    # Happy path
    setattr(obj, attribute, "#ff6d04")
    tester.assertEqual(getattr(obj, attribute), "#ff6d04")

    _none_check(tester, obj, attribute, nullable)


def assert_float_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    tester.assertRaises(ValueError, setattr, obj, attribute, "blah")

    setattr(obj, attribute, 51.51)
    tester.assertEqual(getattr(obj, attribute), 51.51)
    _none_check(tester, obj, attribute, nullable)


def assert_string_prop(
    tester: unittest.TestCase, obj, attribute, nullable=False
):
    setattr(obj, attribute, "test string")
    tester.assertEqual(getattr(obj, attribute), "test string")
    _none_check(tester, obj, attribute, nullable)
