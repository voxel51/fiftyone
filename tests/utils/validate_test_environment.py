"""
Validates the dependency boundary for a test environment profile.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import argparse
import importlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import sysconfig

ML_MODULES = ("tensorflow", "torch", "torchvision", "transformers")
IMPORT_COMMAND = "import importlib, sys; importlib.import_module(sys.argv[1])"


def _aws_command():
    scripts_dir = Path(sysconfig.get_path("scripts"))
    for name in ("aws", "aws.exe"):
        candidate = scripts_dir / name
        if candidate.is_file():
            if os.name == "nt" and candidate.suffix != ".exe":
                return [sys.executable, str(candidate), "--version"]

            return [str(candidate), "--version"]

    return None


def _validate_core():
    unexpected = [
        module
        for module in ML_MODULES
        if importlib.util.find_spec(module) is not None
    ]
    if (
        importlib.util.find_spec("awscli") is not None
        or _aws_command() is not None
    ):
        unexpected.append("awscli")

    if unexpected:
        raise RuntimeError(
            "core test environment contains ML/cloud tools: "
            + ", ".join(unexpected)
        )


def _validate_ml_cloud():
    for module in ML_MODULES:
        subprocess.run(
            [sys.executable, "-c", IMPORT_COMMAND, module],
            check=True,
        )

    importlib.import_module("awscli")
    aws_command = _aws_command()
    if aws_command is None:
        raise RuntimeError(
            "ml-cloud test environment is missing its AWS CLI executable"
        )

    subprocess.run(
        aws_command,
        check=True,
        capture_output=True,
        text=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", choices=("core", "ml-cloud"))
    args = parser.parse_args()

    if args.profile == "core":
        _validate_core()
    else:
        _validate_ml_cloud()

    print(f"validated {args.profile} test environment")


if __name__ == "__main__":
    main()
