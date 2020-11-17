#!/bin/bash
set -e -u -x
rm -rf /opt/python/cp2*

PKG="$1"
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
    PYTHONPATH="${PYTHONPATH}:/io/package" "${PYBIN}/pip" wheel \
        "/io/package/${PKG}" --no-deps -w "/io/package/${PKG}/dist"
done

# Bundle external shared libraries into the wheels
for whl in "/io/package/${PKG}/*.whl"; do
    repair_wheel "$whl"
done

# Install packages and test
for PYBIN in /opt/python/*/bin/; do
    "${PYBIN}/pip" install "fiftyone-${PKG}" --no-index -f "/io/package/${PKG}/dist"
    (cd "$HOME"; "${PYBIN}/nosetests" "fiftyone-${PKG}")
done
