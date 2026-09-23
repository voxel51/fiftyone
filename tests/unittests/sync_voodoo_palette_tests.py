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

SLOTS = ["orange", "blue", "purple"]

BRAND = {"primary": "#FA5300", "accent": "#FF8A3D"}

PRIMITIVES = {
    "orange": {"500": "#FF6D04"},
    "blue": {"500": "#2563EB"},
    "purple": {"500": "#8B5CF6", "600": "#6F42C1"},
}


def _install_fixture(tmpdir, pool=None, slots=None, primitives=None, brand=None):
    """Writes a stand-in ``@voxel51/voodo`` into ``tmpdir/node_modules``.

    Lets the tests drive the real ``node`` path the tool uses, rather than
    mocking out the subprocess and asserting nothing about resolution.

    Args:
        tmpdir: the directory to treat as ``app/``
        pool (None): the palette pool the fixture exports
        slots (None): the hue names the fixture exports
        primitives (None): the primitive scales the fixture exports
        brand (None): the mode-independent brand colors the fixture exports
    """
    if pool is None:
        pool = POOL

    if slots is None:
        slots = SLOTS[: len(pool)]

    if primitives is None:
        primitives = PRIMITIVES

    if brand is None:
        brand = BRAND

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
            "export const overlayPool = %s;\n"
            "export const paletteSlots = %s;\n"
            "export const primitives = %s;\n"
            "export const colors = %s;\n"
            % (
                json.dumps(pool),
                json.dumps(slots),
                json.dumps(primitives),
                json.dumps({"common": {"brand": brand}}),
            )
        )


@unittest.skipIf(shutil.which("node") is None, "node is required")
class ReadTokensTests(unittest.TestCase):
    def test_reads_the_overlay_pool_from_the_dependency(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            _install_fixture(tmpdir)
            with patch.object(fosvp, "APP_DIR", tmpdir):
                pool, slots, primitives, brand = fosvp._read_tokens()

        self.assertEqual(pool, POOL)
        self.assertEqual(slots, SLOTS)
        self.assertEqual(primitives, PRIMITIVES)
        self.assertEqual(brand, BRAND)

    def test_pool_length_follows_the_dependency(self):
        # A palette is N colors, not a fixed count
        for count in (3, 12, 17):
            pool = ["#%06d" % i for i in range(count)]
            slots = ["hue%d" % i for i in range(count)]
            with tempfile.TemporaryDirectory() as tmpdir:
                _install_fixture(tmpdir, pool=pool, slots=slots)
                with patch.object(fosvp, "APP_DIR", tmpdir):
                    read, read_slots, _, _ = fosvp._read_tokens()

            self.assertEqual(read, pool)
            self.assertEqual(read_slots, slots)

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
        module = fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND)

        # constants.py imports this, so it has to be valid Python exposing
        # COLOR_POOL -- exec it and check the binding
        namespace = {}
        exec(compile(module, "_voodoo_palette.py", "exec"), namespace)

        self.assertEqual(namespace["COLOR_POOL"], POOL)

    def test_labels_each_color_with_its_scale_step(self):
        module = fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND)

        self.assertIn('    "#FF6D04",  # 1: orange (orange 500)', module)
        self.assertIn('    "#6F42C1",  # 3: purple (purple 600)', module)

    def test_color_outside_the_primitives_keeps_its_hue_name(self):
        # The hue name is the token's own name, so it is known even when the
        # value matches no primitive step
        module = fosvp._render(["#ABCDEF"], ["ghost"], PRIMITIVES, BRAND)

        self.assertIn('    "#ABCDEF",  # 1: ghost', module)

    def test_slot_without_a_name_is_labeled_unnamed(self):
        module = fosvp._render(POOL, ["orange"], PRIMITIVES, BRAND)

        self.assertIn('    "#2563EB",  # 2: unnamed (blue 500)', module)

    def test_hue_name_disagreeing_with_the_step_is_visible(self):
        # A semantic token pointing at another hue's ramp is worth seeing
        module = fosvp._render(["#2563EB"], ["teal"], PRIMITIVES, BRAND)

        self.assertIn('    "#2563EB",  # 1: teal (blue 500)', module)

    def test_warns_against_hand_editing(self):
        self.assertIn("AUTO-GENERATED", fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND))

    def test_emits_the_brand_colors(self):
        module = fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND)

        self.assertIn('BRAND_PRIMARY = "#FA5300"', module)
        self.assertIn('BRAND_ACCENT = "#FF8A3D"', module)

    def test_fits_black_line_length(self):
        module = fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND)

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
        self.assertIn('"#FF6D04",  # 1: orange (orange 500)', contents)

    def test_write_is_idempotent(self):
        module = fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND)

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
        code, _ = self._run(["--check"], body=fosvp._render(POOL, SLOTS, PRIMITIVES, BRAND))

        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
