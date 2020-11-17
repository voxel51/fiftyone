#!/bin/bash
set -e -u -x
rm -rf /opt/python/cp2*

PKG="$1"
PKG_PATH="$2"

function repair_wheel {
    wheel="$1"
    if ! auditwheel show "$wheel"; then
        echo "Skipping non-platform wheel $wheel"
    else
        auditwheel repair "$wheel" --plat manylinux1_x86_64 -w /io/wheelhouse/
    fi
}


# Install a system package required by our library
yum install -y atlas-devel

# Compile wheels
for PYBIN in /opt/python/*/bin; do
    "${PYBIN}/pip" wheel "/io/${PKG_PATH}" --no-deps -w "/io/${PKG_PATH}/dist"
done

# Bundle external shared libraries into the wheels
for whl in "/io/package/${PKG_PATH}/*.whl"; do
    repair_wheel "$whl"
done

# Install packages and test
for PYBIN in /opt/python/*/bin/; do
    cd "/io/${PKG_PATH}"
    "${PYBIN}/pip" install "fiftyone-${PKG}" --no-index -f "/io/${PKG_PATH}/dist"
    (cd "$HOME"; "${PYBIN}/nosetests" "fiftyone-${PKG}")
done
