"""
Generate multimodal protobuf contracts for Python and TypeScript.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

BUILD_FILE = Path(__file__).resolve()
SCHEMA_ROOT = BUILD_FILE.parent
REPO_ROOT = BUILD_FILE.parents[2]
APP_ROOT = REPO_ROOT / "app"
PYTHON_ROOT = REPO_ROOT / "fiftyone" / "multimodal"
TS_ROOT = (
    REPO_ROOT / "app" / "packages" / "multimodal" / "src" / "types" / "shared"
)
TS_PLUGIN_PATH = APP_ROOT / "node_modules" / ".bin" / "protoc-gen-es"
MINIMUM_PROTOC_VERSION = (33,)
TS_PLUGIN_NAME = "protoc-gen-es"
TS_PLUGIN_OPTION = "target=ts"
PROTO_NAME = "contracts.proto"
PYTHON_GENERATED_NAME = "contracts_pb2.py"
TS_GENERATED_NAME = "contracts_pb.ts"
VERSION_SPECS = {
    "v1": {
        "schema_subdir": Path("v1"),
        "python_out_subdir": Path("schemas") / "v1" / "__generated",
        "ts_out_subdir": Path("schemas") / "v1" / "__generated",
    }
}


def _run(command):
    try:
        result = subprocess.run(
            command,
            check=True,
            stderr=subprocess.STDOUT,
            stdout=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        output = (error.stdout or "").strip()
        if output:
            raise RuntimeError(output) from error

        raise RuntimeError("Command failed: %s" % " ".join(command)) from error
    except FileNotFoundError as error:
        raise RuntimeError("Missing command: %s" % command[0]) from error

    return result.stdout.strip()


def get_local_toolchain():
    """Gets the local protobuf codegen toolchain."""

    protoc_path = os.environ.get("PROTOC") or shutil.which("protoc")
    if not protoc_path:
        raise RuntimeError("Missing protoc. Install libprotoc > 33 first.")

    # Parse protoc's human-readable --version output into a comparable tuple.
    protoc_output = _run([protoc_path, "--version"])
    protoc_match = re.search(r"libprotoc (\S+)", protoc_output)
    if not protoc_match:
        raise RuntimeError(
            "Unable to parse protoc version from: %s" % protoc_output
        )

    protoc_version = protoc_match.group(1)
    protoc_version_parts = tuple(
        int(part) for part in re.findall(r"\d+", protoc_version)
    )

    if not protoc_version_parts:
        raise RuntimeError(
            "Unable to parse protoc version from: %s" % protoc_version
        )

    if protoc_version_parts <= MINIMUM_PROTOC_VERSION:
        raise RuntimeError(
            "Unsupported protoc version %s at %s. Expected libprotoc > 33."
            % (
                protoc_version,
                protoc_path,
            )
        )

    if not TS_PLUGIN_PATH.is_file():
        raise RuntimeError(
            "Unable to find %s in app dependencies. "
            "Run `cd app && yarn install`." % TS_PLUGIN_NAME
        )

    ts_plugin_path = str(TS_PLUGIN_PATH)
    # We only surface the plugin version for visibility; package.json pins it.
    ts_plugin_output = _run([ts_plugin_path, "--version"])
    ts_plugin_match = re.search(r"v(\S+)", ts_plugin_output)
    if ts_plugin_match:
        ts_plugin_version = ts_plugin_match.group(1)
    else:
        ts_plugin_version = ts_plugin_output

    return {
        "protoc_path": protoc_path,
        "protoc_version": protoc_version,
        "ts_plugin_path": ts_plugin_path,
        "ts_plugin_version": ts_plugin_version,
    }


def build_contracts(schema_root, python_root, ts_root):
    """Generates all known multimodal protobuf contract versions."""

    toolchain = get_local_toolchain()
    generated = {}

    for version in VERSION_SPECS:
        spec = VERSION_SPECS[version]
        schema_dir = (
            Path(schema_root).resolve() / spec["schema_subdir"]
        ).resolve()
        proto_path = schema_dir / PROTO_NAME
        python_out_dir = (
            Path(python_root).resolve() / spec["python_out_subdir"]
        ).resolve()
        ts_out_dir = (
            Path(ts_root).resolve() / spec["ts_out_subdir"]
        ).resolve()

        if not proto_path.exists():
            raise FileNotFoundError("Missing protobuf schema: %s" % proto_path)

        python_out_dir.mkdir(parents=True, exist_ok=True)
        ts_out_dir.mkdir(parents=True, exist_ok=True)

        # resolve inputs, run protoc once, then verify the expected outputs.
        _run(
            [
                toolchain["protoc_path"],
                "--plugin=protoc-gen-es=%s" % toolchain["ts_plugin_path"],
                "--proto_path=%s" % schema_dir,
                "--python_out=%s" % python_out_dir,
                "--es_out=%s:%s" % (TS_PLUGIN_OPTION, ts_out_dir),
                str(proto_path),
            ]
        )

        python_generated = python_out_dir / PYTHON_GENERATED_NAME
        ts_generated = ts_out_dir / TS_GENERATED_NAME
        if not python_generated.exists():
            raise FileNotFoundError(
                "Missing generated Python protobuf module: %s"
                % python_generated
            )

        if not ts_generated.exists():
            raise FileNotFoundError(
                "Missing generated TypeScript protobuf module: %s"
                % ts_generated
            )

        generated[version] = {
            "schema": proto_path,
            "python": python_generated,
            "typescript": ts_generated,
            "toolchain": toolchain,
        }

    return generated


def main(argv=None):
    """CLI entrypoint."""

    argv = list(argv or [])
    if argv:
        print("build.py does not accept arguments.", file=sys.stderr)
        return 2

    try:
        generated = build_contracts(
            SCHEMA_ROOT,
            PYTHON_ROOT,
            TS_ROOT,
        )
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1

    toolchain = next(iter(generated.values()))["toolchain"]
    print("Validated multimodal codegen toolchain")
    print(
        "protoc: %s (libprotoc %s)"
        % (
            toolchain["protoc_path"],
            toolchain["protoc_version"],
        )
    )
    print(
        "%s: %s (v%s)"
        % (
            TS_PLUGIN_NAME,
            toolchain["ts_plugin_path"],
            toolchain["ts_plugin_version"],
        )
    )
    for version, outputs in generated.items():
        print("Schema (%s): %s" % (version, outputs["schema"]))
        print("Generated Python (%s): %s" % (version, outputs["python"]))
        print(
            "Generated TypeScript (%s): %s"
            % (
                version,
                outputs["typescript"],
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
