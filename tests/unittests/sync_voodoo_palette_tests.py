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

    def test_missing_slot_raises(self):
        palette = {str(i): "#000000" for i in range(1, 12)}
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens(palette=palette))
            with self.assertRaises(SystemExit):
                fosvp._load_palette(path)

    def test_restructured_tokens_raise(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, {"colors": {}})
            with self.assertRaises(SystemExit):
                fosvp._load_palette(path)


class RenderTests(unittest.TestCase):
    def test_block_is_marked_and_ordered(self):
        block = fosvp._render(
            [("#AAAAAA", "red 500"), ("#BBBBBB", "blue 500")]
        )

        self.assertTrue(block.startswith(fosvp.BEGIN_MARKER))
        self.assertTrue(block.endswith(fosvp.END_MARKER))
        self.assertIn('    "#AAAAAA",  # 1: red 500', block)
        self.assertIn('    "#BBBBBB",  # 2: blue 500', block)

    def test_block_fits_black_line_length(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_tokens(tmpdir, _tokens())
            block = fosvp._render(fosvp._load_palette(path))

        for line in block.split("\n"):
            self.assertLessEqual(len(line), 79)


class SpliceTests(unittest.TestCase):
    def _source(self, body):
        return "before\n%s\n%s\n%s\nafter\n" % (
            fosvp.BEGIN_MARKER,
            body,
            fosvp.END_MARKER,
        )

    def test_replaces_only_the_marked_block(self):
        source = self._source("DEFAULT_APP_COLOR_POOL = []")
        block = fosvp._render([("#AAAAAA", "red 500")])

        updated = fosvp._splice(source, block)

        self.assertTrue(updated.startswith("before\n"))
        self.assertTrue(updated.endswith("after\n"))
        self.assertIn('"#AAAAAA"', updated)
        self.assertNotIn("DEFAULT_APP_COLOR_POOL = []", updated)

    def test_is_idempotent(self):
        block = fosvp._render([("#AAAAAA", "red 500")])
        source = self._source("DEFAULT_APP_COLOR_POOL = []")

        once = fosvp._splice(source, block)
        twice = fosvp._splice(once, block)

        self.assertEqual(once, twice)

    def test_missing_markers_raise(self):
        with self.assertRaises(SystemExit):
            fosvp._splice("no markers here\n", "block")


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
    def _run(self, argv, constants_body="DEFAULT_APP_COLOR_POOL = []"):
        """Runs ``main()`` against a throwaway constants file.

        Returns:
            an ``(exit_code, contents)`` tuple
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tokens = _write_tokens(tmpdir, _tokens())
            constants = os.path.join(tmpdir, "constants.py")
            with open(constants, "wt") as f:
                f.write(
                    "before\n%s\n%s\n%s\nafter\n"
                    % (
                        fosvp.BEGIN_MARKER,
                        constants_body,
                        fosvp.END_MARKER,
                    )
                )

            argv = ["sync_voodoo_palette.py", "--tokens", tokens] + argv
            with patch.object(fosvp, "CONSTANTS_PATH", constants):
                with patch("sys.argv", argv):
                    code = fosvp.main()

            with open(constants, "rt") as f:
                return code, f.read()

    def test_write_updates_the_file(self):
        code, contents = self._run([])

        self.assertEqual(code, 0)
        self.assertNotIn("DEFAULT_APP_COLOR_POOL = []", contents)
        self.assertIn(fosvp.BEGIN_MARKER, contents)

    def test_check_fails_when_out_of_date(self):
        code, contents = self._run(["--check"])

        self.assertEqual(code, 1)
        self.assertIn(
            "DEFAULT_APP_COLOR_POOL = []", contents, "--check must not write"
        )

    def test_check_passes_when_in_sync(self):
        block = fosvp._render(
            [("#00000%d" % (i % 10), "unmapped") for i in range(1, 13)]
        )
        body = "\n".join(block.split("\n")[1:-1])

        code, _ = self._run(["--check"], constants_body=body)

        self.assertEqual(code, 0)

    def test_print_does_not_write(self):
        code, contents = self._run(["--print"])

        self.assertEqual(code, 0)
        self.assertIn("DEFAULT_APP_COLOR_POOL = []", contents)


if __name__ == "__main__":
    unittest.main(verbosity=2)
