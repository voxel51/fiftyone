# Multimodal Contracts

This directory contains the shared protobuf contracts for the multimodal
scaffolding work.

The `.proto` schemas are the source of truth for the generated Python and
TypeScript contract surfaces consumed by the SDK and app packages.

## Files

-   `v1/common.proto`: shared descriptors and time primitives
-   `v1/inventory.proto`: source inventory contract
-   `v1/playback.proto`: playback plan, panel, and layout contract
-   `build.py`: local code generation entrypoint for Python and TypeScript

## Usage

The build script does two things:

1. validates the local codegen toolchain
2. generates Python and TypeScript contracts from the versioned schema tree

It uses:

-   all protobuf files under the current versioned schema directory as the
    schema source of truth
-   project-local `protoc-gen-es` from `app/package.json`
-   local `protoc` matching the Python protobuf runtime pinned in `setup.py`

`protoc` generates the Python output natively. TypeScript generation is not a
built-in `protoc` feature, so it uses the external `protoc-gen-es` plugin. The
script intentionally rejects different `protoc` versions because the generated
files embed protobuf runtime version check.

```bash
cd app && yarn install
cd ..
protoc --version

# activate FO environment
python schemas/multimodal/build.py
```

If your default `protoc` does not match the `setup.py` protobuf pin,
install/select the matching version and point the build at it:

```bash
PROTOC=/path/to/protoc python schemas/multimodal/build.py
```

The Python package version and `protoc` version differ by the Python major
prefix. For example, `protobuf==6.33.6` in `setup.py` requires
`protoc --version` to print `libprotoc 33.6`.

For macOS and Linux binaries, use the official Protocol Buffers release page:
https://github.com/protocolbuffers/protobuf/releases/tag/v33.6.
