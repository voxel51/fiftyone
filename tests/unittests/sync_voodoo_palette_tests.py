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


class RenderTypeScriptTests(unittest.TestCase):
    def test_exports_a_typed_readonly_array(self):
        module = fosvp._render_typescript([("#AAAAAA", "red 500")])

        self.assertIn(
            "export const VOODOO_COLOR_POOL: readonly string[] = [", module
        )

    def test_labels_each_entry(self):
        module = fosvp._render_typescript(
            [("#AAAAAA", "red 500"), ("#BBBBBB", "blue 500")]
        )

        self.assertIn('  "#AAAAAA", // 1: red 500', module)
        self.assertIn('  "#BBBBBB", // 2: blue 500', module)

    def test_warns_against_hand_editing(self):
        module = fosvp._render_typescript([("#AAAAAA", "red 500")])

        self.assertIn("AUTO-GENERATED", module)


class TargetsTests(unittest.TestCase):
    def test_covers_both_consumers(self):
        targets = fosvp._targets([("#AAAAAA", "red 500")])
        paths = [path for path, _ in targets]

        self.assertEqual(paths, [fosvp.PYTHON_TARGET, fosvp.TYPESCRIPT_TARGET])


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
    def _run(self, argv, python_body=None, typescript_body=None):
        """Runs ``main()`` against throwaway output files.

        Args:
            argv: extra command-line arguments
            python_body (None): initial contents of the Python target
            typescript_body (None): initial contents of the TypeScript target

        Returns:
            an ``(exit_code, python_contents, typescript_contents)`` tuple
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tokens = _write_tokens(tmpdir, _tokens())
            py_path = os.path.join(tmpdir, "_voodoo_palette.py")
            ts_path = os.path.join(tmpdir, "voodooPalette.ts")

            for path, body in (
                (py_path, python_body),
                (ts_path, typescript_body),
            ):
                if body is not None:
                    with open(path, "wt") as f:
                        f.write(body)

            argv = ["sync_voodoo_palette.py", "--tokens", tokens] + argv
            with patch.object(fosvp, "PYTHON_TARGET", py_path):
                with patch.object(fosvp, "TYPESCRIPT_TARGET", ts_path):
                    with patch("sys.argv", argv):
                        code = fosvp.main()

            return (
                code,
                self._read(py_path),
                self._read(ts_path),
            )

    def _read(self, path):
        if not os.path.isfile(path):
            return None

        with open(path, "rt") as f:
            return f.read()

    def test_write_creates_both_modules(self):
        code, python, typescript = self._run([])

        self.assertEqual(code, 0)
        self.assertIn("COLOR_POOL = [", python)
        self.assertIn("VOODOO_COLOR_POOL", typescript)

    def test_check_fails_when_out_of_date(self):
        code, python, _ = self._run(["--check"], python_body="stale\n")

        self.assertEqual(code, 1)
        self.assertEqual(python, "stale\n", "--check must not write")

    def test_check_fails_when_a_module_is_missing(self):
        code, _, _ = self._run(["--check"])

        self.assertEqual(code, 1)

    def test_check_passes_when_both_are_in_sync(self):
        pool = [("#00000%d" % (i % 10), "unmapped") for i in range(1, 13)]

        code, _, _ = self._run(
            ["--check"],
            python_body=fosvp._render_python(pool),
            typescript_body=fosvp._render_typescript(pool),
        )

        self.assertEqual(code, 0)

    def test_print_does_not_write(self):
        code, python, typescript = self._run(["--print"])

        self.assertEqual(code, 0)
        self.assertIsNone(python)
        self.assertIsNone(typescript)

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
