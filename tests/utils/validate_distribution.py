"""
Validates the built FiftyOne wheel and an installed copy of it.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import argparse
import configparser
import email
import importlib
from importlib import metadata
from pathlib import Path
import zipfile

PROJECT_NAME = "fiftyone"
CONSOLE_SCRIPT = "fiftyone"
CONSOLE_TARGET = "fiftyone.core.cli:main"
REQUIRED_PACKAGE_FILES = (
    "fiftyone/multimodal/schemas/py.typed",
    "fiftyone/multimodal/schemas/v1/__generated__/common_pb2.py",
    "fiftyone/zoo/models/manifest-torch.json",
)
SOURCE_ONLY_PREFIXES = (
    "app/",
    "build/",
    "dist/",
    "docs/",
    "tests/",
    "tools/",
)


def _require(condition, message):
    if not condition:
        raise RuntimeError(message)


def _validate_wheel(wheel_path, expected_version):
    with zipfile.ZipFile(wheel_path) as archive:
        names = archive.namelist()

        metadata_name = next(
            (
                name
                for name in names
                if name.endswith(".dist-info/METADATA")
            ),
            None,
        )
        _require(
            metadata_name is not None,
            "wheel is missing dist-info METADATA",
        )
        package_metadata = email.message_from_bytes(
            archive.read(metadata_name)
        )
        _require(
            package_metadata["Name"] == PROJECT_NAME,
            f"unexpected project name: {package_metadata['Name']}",
        )
        _require(
            package_metadata["Version"] == expected_version,
            f"unexpected version: {package_metadata['Version']}",
        )

        entry_points_name = next(
            (
                name
                for name in names
                if name.endswith(".dist-info/entry_points.txt")
            ),
            None,
        )
        _require(
            entry_points_name is not None,
            "wheel is missing dist-info entry_points.txt",
        )
        entry_points = configparser.ConfigParser()
        entry_points.read_string(
            archive.read(entry_points_name).decode("utf-8")
        )
        _require(
            entry_points.has_option("console_scripts", CONSOLE_SCRIPT)
            and entry_points["console_scripts"][CONSOLE_SCRIPT]
            == CONSOLE_TARGET,
            "fiftyone console script is missing or has the wrong target",
        )

        for required_name in REQUIRED_PACKAGE_FILES:
            _require(
                required_name in names,
                f"required package file is missing: {required_name}",
            )

        _require(
            any(
                name.startswith("fiftyone/server/static/")
                and not name.endswith("/")
                for name in names
            ),
            "built application static assets are missing",
        )

        source_only = [
            name
            for name in names
            if name.startswith(SOURCE_ONLY_PREFIXES)
            or "__pycache__" in Path(name).parts
            or ".pytest_cache" in Path(name).parts
            or name.endswith((".pyc", ".pyo"))
        ]
        _require(
            not source_only,
            "source-only or cache files found in wheel: "
            + ", ".join(source_only[:10]),
        )


def _validate_installed(expected_version):
    distribution = metadata.distribution(PROJECT_NAME)
    _require(
        distribution.metadata["Name"] == PROJECT_NAME,
        f"unexpected installed project name: {distribution.metadata['Name']}",
    )
    _require(
        distribution.version == expected_version,
        f"unexpected installed version: {distribution.version}",
    )

    fiftyone = importlib.import_module("fiftyone")
    foc = importlib.import_module("fiftyone.constants")

    _require(
        fiftyone.__version__ == expected_version,
        f"unexpected imported version: {fiftyone.__version__}",
    )
    _require(foc.NAME == PROJECT_NAME, f"unexpected core name: {foc.NAME}")
    _require(
        foc.VERSION == expected_version,
        f"unexpected core version: {foc.VERSION}",
    )

    package_dir = Path(fiftyone.__file__).resolve().parent
    for required_name in REQUIRED_PACKAGE_FILES:
        relative_name = Path(required_name).relative_to(PROJECT_NAME)
        _require(
            (package_dir / relative_name).is_file(),
            f"installed package file is missing: {relative_name}",
        )

    static_dir = package_dir / "server" / "static"
    _require(
        static_dir.is_dir()
        and any(path.is_file() for path in static_dir.rglob("*")),
        "installed application static assets are missing",
    )
    _require(
        not (package_dir / "tests").exists(),
        "source tests were installed inside the package",
    )


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    wheel_parser = subparsers.add_parser("wheel")
    wheel_parser.add_argument("wheel", type=Path)
    wheel_parser.add_argument("--version", required=True)

    installed_parser = subparsers.add_parser("installed")
    installed_parser.add_argument("--version", required=True)

    args = parser.parse_args()
    if args.command == "wheel":
        _validate_wheel(args.wheel, args.version)
    else:
        _validate_installed(args.version)


if __name__ == "__main__":
    main()
