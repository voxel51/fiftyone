# manylinux action

This action builds manylinux wheels required by PyPi for the `fiftyone-app` and
`fiftyone-db` packages, which are not pure python.

## Inputs

### `pkg`

**Required** The package to build; `app` or `db`

## Example usage

uses: voxel51/fiftyone/manylinux@v1
with:
  pkg: 'app'
