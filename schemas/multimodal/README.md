# Multimodal Contracts

This directory contains the shared protobuf contracts for the multimodal
scaffolding work.

The `.proto` schema is the source of truth for the generated Python and
TypeScript contract surfaces consumed by the SDK and app packages.

## Files

-   `v1/contracts.proto`: current versioned multimodal protobuf contract schema
-   `build.py`: local code generation entrypoint for Python and TypeScript

## Usage

The build script does two things:

1. validates the local codegen toolchain
2. generates Python and TypeScript contracts from the versioned schema tree

It uses:

-   `v1/contracts.proto` as the current schema source of truth
-   project-local `protoc-gen-es` from `app/package.json`
-   a local `protoc` binary on `PATH`. See [these instructions](https://protobuf.dev/installation/) on installing for your platform.

`protoc` generates the Python output natively. TypeScript generation is not a
built-in `protoc` feature, so it uses the external `protoc-gen-es` plugin.

```bash
cd app && yarn install
cd ..
protoc --version

# activate FO environment
python schemas/multimodal/build.py
```
