#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel


class CustomBdistWheel(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # not pure Python
        self.root_is_pure = False

    def get_tag(self):
        impl, abi_tag, plat_name = bdist_wheel.get_tag(self)
        # no dependency on a specific CPython version
        impl = "py2.py3"
        abi_tag = "none"
        return impl, abi_tag, plat_name


cmdclass = {
    "bdist_wheel": CustomBdistWheel,
}

setup(
    name="fiftyone-db",
    version="0.1.0",
    description="Project FiftyOne database",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=find_packages(),
    include_package_data=True,
    package_data={"fiftyone-db": ["bin/*"]},
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
    ],
    python_requires=">=2.7",
    cmdclass=cmdclass,
)
