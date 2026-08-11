"""
Unit tests for the Voodo palette sync tool.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib.util
import json
import os
import tempfile
import unittest
from unittest.mock import patch


def _load_tool():
    """Loads ``tools/sync_voodoo_palette.py`` as a module.

    The tool is repo tooling rather than part of the ``fiftyone`` package, so
    it is not importable by name.

    Returns:
        the imported module
    """
    root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    path = os.path.join(root, "tools", "sync_voodoo_palette.py")
    spec = importlib.util.spec_from_file_location("sync_voodoo_palette", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


fosvp = _load_tool()


def _tokens(palette=None, primitives=None):
    """Builds a minimal Voodo tokens payload."""
    if palette is None:
        palette = {str(i): "#00000%d" % (i % 10) for i in range(1, 13)}

    if primitives is None:
        primitives = {}

    return {
        "primitives": primitives,
        "colors": {"dark": {"content": {"palette": palette}}},
    }


def _write_tokens(tmpdir, tokens):
    path = os.path.join(tmpdir, "tokens.json")
    with open(path, "wt") as f:
        json.dump(tokens, f)

    return path


class LoadPaletteTests(unittest.TestCase):
    def test_returns_slots_in_pool_order(self):
        palette = {str(i): "#%06d" % i for i in range(1, 13)}
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens(palette=palette))
            pool = fosvp._load_palette(path)

        self.assertEqual(len(pool), 12)
        self.assertEqual([color for color, _ in pool], list(palette.values()))

    def test_labels_from_primitives(self):
        palette = dict(
            {str(i): "#00000%d" % (i % 10) for i in range(2, 13)},
            **{"1": "#6F42C1"},
        )
        primitives = {"purple": {"500": "#8B5CF6", "600": "#6F42C1"}}
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(
                tmpdir, _tokens(palette=palette, primitives=primitives)
            )
            pool = fosvp._load_palette(path)

        self.assertEqual(pool[0], ("#6F42C1", "purple 600"))

    def test_unmapped_color_is_labeled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens())
            pool = fosvp._load_palette(path)

        self.assertEqual(pool[0][1], "unmapped")

    def test_length_follows_the_tokens(self):
        # A palette is N colors, not a fixed count
        for count in (3, 12, 17):
            palette = {str(i): "#%06d" % i for i in range(1, count + 1)}
            with tempfile.TemporaryDirectory() as tmpdir:
                path = _write_tokens(tmpdir, _tokens(palette=palette))
                pool = fosvp._load_palette(path)

            self.assertEqual(len(pool), count)

    def test_slots_are_ordered_numerically(self):
        # Lexicographic ordering would put "10" before "2"
        palette = {str(i): "#%06d" % i for i in range(1, 13)}
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens(palette=palette))
            pool = fosvp._load_palette(path)

        self.assertEqual(
            [color for color, _ in pool],
            ["#%06d" % i for i in range(1, 13)],
        )

    def test_named_aliases_are_excluded(self):
        palette = {"1": "#AAAAAA", "2": "#BBBBBB", "orange": "#AAAAAA"}
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens(palette=palette))
            pool = fosvp._load_palette(path)

        self.assertEqual([color for color, _ in pool], ["#AAAAAA", "#BBBBBB"])

    def test_no_numbered_slots_raises(self):
        palette = {"orange": "#AAAAAA", "teal": "#BBBBBB"}
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens(palette=palette))
            with self.assertRaises(SystemExit):
                fosvp._load_palette(path)

    def test_restructured_tokens_raise(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, {"colors": {}})
            with self.assertRaises(SystemExit):
                fosvp._load_palette(path)


class RenderPythonTests(unittest.TestCase):
    def test_emits_an_importable_module(self):
        module = fosvp._render_python(
            [("#AAAAAA", "red 500"), ("#BBBBBB", "blue 500")]
        )

        # The generated module is imported by constants.py, so it has to be
        # valid Python exposing COLOR_POOL -- exec it and check the binding
        namespace = {}
        exec(compile(module, "_voodoo_palette.py", "exec"), namespace)

        self.assertEqual(namespace["COLOR_POOL"], ["#AAAAAA", "#BBBBBB"])

    def test_labels_each_entry(self):
        module = fosvp._render_python([("#AAAAAA", "red 500")])

        self.assertIn('    "#AAAAAA",  # 1: red 500', module)

    def test_warns_against_hand_editing(self):
        module = fosvp._render_python([("#AAAAAA", "red 500")])

        self.assertIn("AUTO-GENERATED", module)

    def test_fits_black_line_length(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens())
            module = fosvp._render_python(fosvp._load_palette(path))

        for line in module.split("\n"):
            self.assertLessEqual(len(line), 79)


class FindTokensTests(unittest.TestCase):
    def test_explicit_path_wins(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens())
            self.assertEqual(fosvp._find_tokens(path), path)

    def test_missing_explicit_path_raises(self):
        with self.assertRaises(SystemExit):
            fosvp._find_tokens("/nonexistent/tokens.json")

    def test_env_var_is_honored(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens())
            with patch.dict(os.environ, {"VOODO_TOKENS": path}):
                self.assertEqual(fosvp._find_tokens(), path)

    def test_missing_tokens_raise(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(fosvp, "TOKENS_CANDIDATES", []):
                with self.assertRaises(SystemExit):
                    fosvp._find_tokens()

    def test_skip_if_missing_returns_none(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(fosvp, "TOKENS_CANDIDATES", []):
                self.assertIsNone(fosvp._find_tokens(skip_if_missing=True))


class MainTests(unittest.TestCase):
    def _run(self, argv, body=None):
        """Runs ``main()`` against a throwaway output file.

        Args:
            argv: extra command-line arguments
            body (None): initial contents of the generated module

        Returns:
            an ``(exit_code, contents)`` tuple; contents is ``None`` when
            nothing was written
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tokens = _write_tokens(tmpdir, _tokens())
            path = os.path.join(tmpdir, "_voodoo_palette.py")

            if body is not None:
                with open(path, "wt") as f:
                    f.write(body)

            argv = ["sync_voodoo_palette.py", "--tokens", tokens] + argv
            with patch.object(fosvp, "PYTHON_TARGET", path):
                with patch("sys.argv", argv):
                    code = fosvp.main()

            if not os.path.isfile(path):
                return code, None

            with open(path, "rt") as f:
                return code, f.read()

    def test_write_creates_the_module(self):
        code, contents = self._run([])

        self.assertEqual(code, 0)
        self.assertIn("COLOR_POOL = [", contents)

    def test_check_fails_when_out_of_date(self):
        code, contents = self._run(["--check"], body="stale\n")

        self.assertEqual(code, 1)
        self.assertEqual(contents, "stale\n", "--check must not write")

    def test_check_fails_when_the_module_is_missing(self):
        code, _ = self._run(["--check"])

        self.assertEqual(code, 1)

    def test_check_passes_when_in_sync(self):
        pool = [("#00000%d" % (i % 10), "unmapped") for i in range(1, 13)]

        code, _ = self._run(["--check"], body=fosvp._render_python(pool))

        self.assertEqual(code, 0)

    def test_print_does_not_write(self):
        code, contents = self._run(["--print"])

        self.assertEqual(code, 0)
        self.assertIsNone(contents)

    def test_skip_if_missing_is_a_noop(self):
        # The CI drift check depends on this branch: with no tokens installed
        # it must succeed and write nothing, rather than failing the job
        with tempfile.TemporaryDirectory() as tmpdir:
            py_path = os.path.join(tmpdir, "_voodoo_palette.py")
            argv = ["sync_voodoo_palette.py", "--check", "--skip-if-missing"]

            with patch.dict(os.environ, {}, clear=True):
                with patch.object(fosvp, "TOKENS_CANDIDATES", []):
                    with patch.object(fosvp, "PYTHON_TARGET", py_path):
                        with patch("sys.argv", argv):
                            self.assertEqual(fosvp.main(), 0)

            self.assertFalse(os.path.exists(py_path))


if __name__ == "__main__":
    unittest.main(verbosity=2)
