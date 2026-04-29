"""
Generate multimodal protobuf contracts for Python and TypeScript.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from collections.abc import Sequence
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import TypedDict


class Toolchain(TypedDict):
    """Resolved protobuf codegen toolchain."""

    protoc_path: str
    protoc_version: str
    ts_plugin_path: str
    ts_plugin_version: str


class GeneratedOutput(TypedDict):
    """Generated files for a versioned multimodal schema."""

    schema: Path
    python: Path
    typescript: Path


BUILD_FILE = Path(__file__).resolve()
SCHEMA_ROOT = BUILD_FILE.parent
REPO_ROOT = BUILD_FILE.parents[2]
APP_ROOT = REPO_ROOT / "app"
PYTHON_ROOT = REPO_ROOT / "fiftyone" / "multimodal"
TS_ROOT = REPO_ROOT / "app" / "packages" / "multimodal" / "src"
TS_PLUGIN_PATH = APP_ROOT / "node_modules" / ".bin" / "protoc-gen-es"
TS_PLUGIN_NAME = "protoc-gen-es"
TS_PLUGIN_OPTION = "target=ts"
PROTO_NAME = "contracts.proto"
PYTHON_GENERATED_NAME = "contracts_pb2.py"
TS_GENERATED_NAME = "contracts_pb.ts"
VERSION_SPECS = {
    "v1": {
        "schema_subdir": Path("v1"),
        "python_out_subdir": Path("schemas") / "v1" / "__generated__",
        "ts_out_subdir": Path("schemas") / "v1" / "__generated__",
    }
}


def _run(command: Sequence[str]) -> str:
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

        raise RuntimeError(f"Command failed: {' '.join(command)}") from error
    except FileNotFoundError as error:
        raise RuntimeError(f"Missing command: {command[0]}") from error

    return result.stdout.strip()


def get_local_toolchain() -> Toolchain:
    """Gets the local protobuf codegen toolchain."""

    # setup.py owns the Python protobuf runtime pin. Match protoc to it so
    # generated Python code does not drift across local environments.
    python_protobuf_version = re.search(
        r"protobuf==([\d.]+)",
        (REPO_ROOT / "setup.py").read_text(),
    ).group(1)
    required_libprotoc_version = ".".join(
        python_protobuf_version.split(".")[1:]
    )
    protoc_path = os.environ.get("PROTOC") or shutil.which("protoc")
    if not protoc_path:
        raise RuntimeError(
            "Missing protoc. Install or select libprotoc "
            f"{required_libprotoc_version}, or set "
            f"PROTOC=/path/to/protoc-{required_libprotoc_version}."
        )

    # Keep Python gencode deterministic and aligned with setup.py's protobuf pin.
    protoc_output = _run([protoc_path, "--version"])
    protoc_match = re.search(r"libprotoc (\S+)", protoc_output)
    if not protoc_match:
        raise RuntimeError(
            f"Unable to parse protoc version from: {protoc_output}"
        )

    protoc_version = protoc_match.group(1)
    if protoc_version != required_libprotoc_version:
        raise RuntimeError(
            "Unsupported protoc version "
            f"{protoc_version} at {protoc_path}. Expected libprotoc "
            f"{required_libprotoc_version} so generated Python matches "
            f"protobuf=={python_protobuf_version}. Install/select that "
            "protoc version or rerun with "
            f"PROTOC=/path/to/protoc-{required_libprotoc_version}."
        )

    if not TS_PLUGIN_PATH.is_file():
        raise RuntimeError(
            f"Unable to find {TS_PLUGIN_NAME} in app dependencies. "
            "Run `cd app && yarn install`."
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


def build_contracts(
    schema_root: Path,
    python_root: Path,
    ts_root: Path,
    toolchain: Toolchain | None = None,
) -> dict[str, GeneratedOutput]:
    """Generates all known multimodal protobuf contract versions."""

    if toolchain is None:
        toolchain = get_local_toolchain()

    generated: dict[str, GeneratedOutput] = {}

    for version, spec in VERSION_SPECS.items():
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
            raise FileNotFoundError(f"Missing protobuf schema: {proto_path}")

        python_out_dir.mkdir(parents=True, exist_ok=True)
        ts_out_dir.mkdir(parents=True, exist_ok=True)

        # resolve inputs, run protoc once, then verify the expected outputs.
        _run(
            [
                toolchain["protoc_path"],
                f"--plugin=protoc-gen-es={toolchain['ts_plugin_path']}",
                f"--proto_path={schema_dir}",
                f"--python_out={python_out_dir}",
                f"--es_out={TS_PLUGIN_OPTION}:{ts_out_dir}",
                str(proto_path),
            ]
        )

        python_generated = python_out_dir / PYTHON_GENERATED_NAME
        ts_generated = ts_out_dir / TS_GENERATED_NAME
        if not python_generated.exists():
            raise FileNotFoundError(
                f"Missing generated Python protobuf module: {python_generated}"
            )

        if not ts_generated.exists():
            raise FileNotFoundError(
                f"Missing generated TypeScript protobuf module: {ts_generated}"
            )

        generated[version] = {
            "schema": proto_path,
            "python": python_generated,
            "typescript": ts_generated,
        }

    return generated


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint."""

    argv = list(argv or [])
    if argv:
        print("build.py does not accept arguments.", file=sys.stderr)
        return 2

    try:
        toolchain = get_local_toolchain()
        generated = build_contracts(
            SCHEMA_ROOT,
            PYTHON_ROOT,
            TS_ROOT,
            toolchain,
        )
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1

    print("Validated multimodal codegen toolchain")
    print(
        f"protoc: {toolchain['protoc_path']} (libprotoc {toolchain['protoc_version']})"
    )
    print(
        f"{TS_PLUGIN_NAME}: {toolchain['ts_plugin_path']} "
        f"(v{toolchain['ts_plugin_version']})"
    )
    for version, outputs in generated.items():
        print(f"Schema ({version}): {outputs['schema']}")
        print(f"Generated Python ({version}): {outputs['python']}")
        print(f"Generated TypeScript ({version}): {outputs['typescript']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
