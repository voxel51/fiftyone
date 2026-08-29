"""
Unit tests for the Voodo palette sync tool.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib.util
import json
import os
import shutil
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

POOL = ["#FF6D04", "#2563EB", "#6F42C1"]

PRIMITIVES = {
    "orange": {"500": "#FF6D04"},
    "blue": {"500": "#2563EB"},
    "purple": {"500": "#8B5CF6", "600": "#6F42C1"},
}


def _install_fixture(tmpdir, pool=None, primitives=None):
    """Writes a stand-in ``@voxel51/voodo`` into ``tmpdir/node_modules``.

    Lets the tests drive the real ``node`` path the tool uses, rather than
    mocking out the subprocess and asserting nothing about resolution.

    Args:
        tmpdir: the directory to treat as ``app/``
        pool (None): the palette pool the fixture exports
        primitives (None): the primitive scales the fixture exports
    """
    if pool is None:
        pool = POOL

    if primitives is None:
        primitives = PRIMITIVES

    package = os.path.join(tmpdir, "node_modules", "@voxel51", "voodo")
    os.makedirs(os.path.join(package, "dist"))

    with open(os.path.join(package, "package.json"), "wt") as f:
        json.dump(
            {
                "name": "@voxel51/voodo",
                "version": "0.2.0",
                "type": "module",
                "exports": {"./tokens": "./dist/tokens.js"},
            },
            f,
        )

    with open(os.path.join(package, "dist", "tokens.js"), "wt") as f:
        f.write(
            "export const palettePool = %s;\nexport const primitives = %s;\n"
            % (
                json.dumps({"dark": pool, "light": pool}),
                json.dumps(primitives),
            )
        )


@unittest.skipIf(shutil.which("node") is None, "node is required")
class ReadTokensTests(unittest.TestCase):
    def test_reads_the_dark_pool_from_the_dependency(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _install_fixture(tmpdir)
            with patch.object(fosvp, "APP_DIR", tmpdir):
                pool, primitives = fosvp._read_tokens()

        self.assertEqual(pool, POOL)
        self.assertEqual(primitives, PRIMITIVES)

    def test_pool_length_follows_the_dependency(self):
        # A palette is N colors, not a fixed count
        for count in (3, 12, 17):
            pool = ["#%06d" % i for i in range(count)]
            with tempfile.TemporaryDirectory() as tmpdir:
                _install_fixture(tmpdir, pool=pool)
                with patch.object(fosvp, "APP_DIR", tmpdir):
                    read, _ = fosvp._read_tokens()

            self.assertEqual(read, pool)

    def test_missing_dependency_raises(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(fosvp, "APP_DIR", tmpdir):
                with self.assertRaises(SystemExit) as ctx:
                    fosvp._read_tokens()

        self.assertIn("yarn install", str(ctx.exception))

    def test_missing_node_raises(self):
        with patch("subprocess.run", side_effect=FileNotFoundError):
            with self.assertRaises(SystemExit) as ctx:
                fosvp._read_tokens()

        self.assertIn("node is required", str(ctx.exception))


class RenderTests(unittest.TestCase):
    def test_emits_an_importable_module(self):
        module = fosvp._render(POOL, PRIMITIVES)

        # constants.py imports this, so it has to be valid Python exposing
        # COLOR_POOL -- exec it and check the binding
        namespace = {}
        exec(compile(module, "_voodoo_palette.py", "exec"), namespace)

        self.assertEqual(namespace["COLOR_POOL"], POOL)

    def test_labels_each_color_with_its_scale_step(self):
        module = fosvp._render(POOL, PRIMITIVES)

        self.assertIn('    "#FF6D04",  # 1: orange 500', module)
        self.assertIn('    "#6F42C1",  # 3: purple 600', module)

    def test_unknown_color_is_labeled_unmapped(self):
        module = fosvp._render(["#ABCDEF"], PRIMITIVES)

        self.assertIn('    "#ABCDEF",  # 1: unmapped', module)

    def test_warns_against_hand_editing(self):
        self.assertIn("AUTO-GENERATED", fosvp._render(POOL, PRIMITIVES))

    def test_fits_black_line_length(self):
        module = fosvp._render(POOL, PRIMITIVES)

        for line in module.split("\n"):
            self.assertLessEqual(len(line), 79)


@unittest.skipIf(shutil.which("node") is None, "node is required")
class MainTests(unittest.TestCase):
    def _run(self, argv, body=None):
        """Runs ``main()`` against a fixture dependency and a temp target.

        Args:
            argv: extra command-line arguments
            body (None): initial contents of the generated module

        Returns:
            an ``(exit_code, contents)`` tuple; contents is ``None`` when
            nothing was written
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            _install_fixture(tmpdir)
            target = os.path.join(tmpdir, "_voodoo_palette.py")

            if body is not None:
                with open(target, "wt") as f:
                    f.write(body)

            argv = ["sync_voodoo_palette.py"] + argv
            with patch.object(fosvp, "APP_DIR", tmpdir):
                with patch.object(fosvp, "TARGET", target):
                    with patch("sys.argv", argv):
                        code = fosvp.main()

            if not os.path.isfile(target):
                return code, None

            with open(target, "rt") as f:
                return code, f.read()

    def test_write_creates_the_module(self):
        code, contents = self._run([])

        self.assertEqual(code, 0)
        self.assertIn('"#FF6D04",  # 1: orange 500', contents)

    def test_write_is_idempotent(self):
        module = fosvp._render(POOL, PRIMITIVES)

        code, contents = self._run([], body=module)

        self.assertEqual(code, 0)
        self.assertEqual(contents, module)

    def test_check_fails_when_stale(self):
        code, contents = self._run(["--check"], body="stale\n")

        self.assertEqual(code, 1)
        self.assertEqual(contents, "stale\n", "--check must not write")

    def test_check_fails_when_missing(self):
        code, contents = self._run(["--check"])

        self.assertEqual(code, 1)
        self.assertIsNone(contents)

    def test_check_passes_when_current(self):
        code, _ = self._run(["--check"], body=fosvp._render(POOL, PRIMITIVES))

        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
