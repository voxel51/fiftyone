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
    protoc_include_path: str
    ts_plugin_path: str
    ts_plugin_version: str


class GeneratedOutput(TypedDict):
    """Generated files for a versioned multimodal schema."""

    schemas: list[Path]
    python: list[Path]
    python_stub: list[Path]
    typescript: list[Path]


BUILD_FILE = Path(__file__).resolve()
SCHEMA_ROOT = BUILD_FILE.parent
REPO_ROOT = BUILD_FILE.parents[2]
APP_ROOT = REPO_ROOT / "app"
PYTHON_ROOT = REPO_ROOT / "fiftyone" / "multimodal"
TS_ROOT = REPO_ROOT / "app" / "packages" / "multimodal" / "src"
TS_PLUGIN_PATH = APP_ROOT / "node_modules" / ".bin" / "protoc-gen-es"
TS_PLUGIN_NAME = "protoc-gen-es"
TS_PLUGIN_OPTION = "target=ts"
PROTO_MODULES = ("common", "inventory", "playback")
PROTOBUF_WELL_KNOWN_TYPE = Path("google") / "protobuf" / "struct.proto"
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
    protoc_path = shutil.which(os.environ.get("PROTOC") or "protoc")
    if not protoc_path:
        raise RuntimeError(
            "Missing protoc. Install or select libprotoc "
            f"{required_libprotoc_version}, or set "
            f"PROTOC=/path/to/protoc-{required_libprotoc_version}."
        )
    protoc_path = str(Path(protoc_path).resolve())

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

    # Well-known type protos come from the local protoc install, not this repo.
    protoc_include_candidates = [
        Path(protoc_path).resolve().parents[1] / "include",
        Path("/opt/homebrew/include"),
        Path("/usr/local/include"),
    ]
    default_protoc_path = shutil.which("protoc")
    if default_protoc_path:
        protoc_include_candidates.append(
            Path(default_protoc_path).resolve().parents[1] / "include"
        )

    for include_path in protoc_include_candidates:
        if (include_path / PROTOBUF_WELL_KNOWN_TYPE).is_file():
            protoc_include_path = str(include_path)
            break
    else:
        raise RuntimeError(
            "Unable to find protobuf well-known type schemas. Install protoc "
            "with its include directory."
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
        "protoc_include_path": protoc_include_path,
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
        proto_paths = [
            (schema_dir / f"{proto_module}.proto").resolve()
            for proto_module in PROTO_MODULES
        ]
        python_out_dir = (
            Path(python_root).resolve() / spec["python_out_subdir"]
        ).resolve()
        ts_out_dir = (
            Path(ts_root).resolve() / spec["ts_out_subdir"]
        ).resolve()
        missing_proto_paths = [
            proto_path for proto_path in proto_paths if not proto_path.exists()
        ]
        if missing_proto_paths:
            missing_schemas = ", ".join(
                str(path) for path in missing_proto_paths
            )
            raise FileNotFoundError(
                f"Missing protobuf schema(s): {missing_schemas}"
            )

        python_out_dir.mkdir(parents=True, exist_ok=True)
        ts_out_dir.mkdir(parents=True, exist_ok=True)

        # resolve inputs, run protoc once, then verify the expected outputs.
        _run(
            [
                toolchain["protoc_path"],
                f"--plugin=protoc-gen-es={toolchain['ts_plugin_path']}",
                f"--proto_path={schema_dir}",
                f"--proto_path={toolchain['protoc_include_path']}",
                f"--python_out={python_out_dir}",
                f"--pyi_out={python_out_dir}",
                f"--es_out={TS_PLUGIN_OPTION}:{ts_out_dir}",
                *[str(proto_path) for proto_path in proto_paths],
            ]
        )

        # Expected filenames follow protoc/protoc-gen-es conventions.
        python_generated = [
            python_out_dir / f"{proto_module}_pb2.py"
            for proto_module in PROTO_MODULES
        ]
        python_stub_generated = [
            python_out_dir / f"{proto_module}_pb2.pyi"
            for proto_module in PROTO_MODULES
        ]
        ts_generated = [
            ts_out_dir / f"{proto_module}_pb.ts"
            for proto_module in PROTO_MODULES
        ]
        expected_outputs = [
            *python_generated,
            *python_stub_generated,
            *ts_generated,
        ]
        missing_outputs = [
            output_path
            for output_path in expected_outputs
            if not output_path.exists()
        ]
        if missing_outputs:
            missing = ", ".join(str(path) for path in missing_outputs)
            raise FileNotFoundError(
                f"Missing generated protobuf output(s): {missing}"
            )

        # protoc emits absolute sibling imports; package modules need relative
        # imports once they live under schemas.v1.__generated__.
        # Replace, for instance, "import common_pb2 as common__pb2"
        # with "from . import common_pb2 as common__pb2"
        for generated_file in [*python_generated, *python_stub_generated]:
            contents = generated_file.read_text()
            patched_contents = contents
            for proto_module in PROTO_MODULES:
                generated_module = f"{proto_module}_pb2"
                patched_contents = re.sub(
                    rf"^import {generated_module} as (.+)$",
                    rf"from . import {generated_module} as \1",
                    patched_contents,
                    flags=re.MULTILINE,
                )
                patched_contents = re.sub(
                    rf"^from {generated_module} import (.+)$",
                    rf"from .{generated_module} import \1",
                    patched_contents,
                    flags=re.MULTILINE,
                )

            if patched_contents != contents:
                generated_file.write_text(patched_contents)

        generated[version] = {
            "schemas": proto_paths,
            "python": python_generated,
            "python_stub": python_stub_generated,
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
        for schema_path in outputs["schemas"]:
            print(f"Schema ({version}): {schema_path}")
        for python_path in outputs["python"]:
            print(f"Generated Python ({version}): {python_path}")
        for python_stub_path in outputs["python_stub"]:
            print(f"Generated Python stub ({version}): {python_stub_path}")
        for typescript_path in outputs["typescript"]:
            print(f"Generated TypeScript ({version}): {typescript_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
