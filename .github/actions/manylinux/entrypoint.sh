#!/bin/sh
set -e -x
rm -rf /opt/python/cp2*
echo "$FIFTYONE_DB_BUILD_LINUX_DISTRO"
echo "REF $GITHUB_REF"
PKG="$1"
PKG_PATH="/github/workspace/${2}"
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/lib
export RELEASE_DIR=/github/workspace/electron/release
RELEASE_VERSION=$(echo "$GITHUB_REF" | sed 's/^refs\/tags\/.*v//')
echo "REF $GITHUB_REF"
function repair_wheel {
    wheel="$1"
    if ! auditwheel show "$wheel"; then
        echo "Skipping non-platform wheel $wheel"
    else
        auditwheel repair "$wheel" --plat manylinux1_x86_64 -w "${PKG_PATH}/dist/"
    fi
}


# Install a system package required by our library
yum install -y atlas-devel
# Compile wheels
for PYBIN in /opt/python/*/bin; do
    "${PYBIN}/pip" wheel "$PKG_PATH" --no-deps -w "${PKG_PATH}/dist"
done

# Bundle external shared libraries into the wheels
for whl in "${PKG_PATH}/dist/*.whl"; do
    repair_wheel "$whl"
done

# Install packages
for PYBIN in /opt/python/*/bin/; do
    cd "${PKG_PATH}"
    "${PYBIN}/pip" install "fiftyone-${PKG}" --no-index -f "${PKG_PATH}/dist"
done
