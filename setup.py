#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel


class BdistWheelCustom(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # pure Python, so build a wheel for any Python version
        self.universal = True
        # make just the wheel require these packages, since they aren't needed
        # for a development installation
        self.distribution.install_requires += [
            "fiftyone-brain>=0.1.4",
            "fiftyone-gui>=0.2.0",
            "fiftyone-db>=0.1.1",
        ]


setup(
    name="fiftyone",
    version="0.2.0",
    description="Project FiftyOne",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=find_packages(exclude=["fiftyone.experimental"])
    + ["fiftyone.examples"],
    package_dir={"fiftyone.examples": "examples"},
    include_package_data=True,
    exclude_package_data={
        "fiftyone": ["experimental/*"],
        "fiftyone.examples": ["archive/*", "data/*"],
    },
    install_requires=[
        # third-party packages
        "argcomplete",
        "eventlet",
        "Flask",
        "flask-socketio",
        "future",
        "gunicorn",
        "mongoengine",
        "numpy",
        "packaging",
        "Pillow<7,>=6.2",
        "pprintpp",
        "psutil",
        "pymongo",
        "python-engineio[client]<3.12;python_version<'3'",
        "python-engineio[client];python_version>='3'",
        "python-socketio[client]<4.5;python_version<'3'",
        "python-socketio[client];python_version>='3'",
        "retrying",
        "setuptools",
        "tabulate",
        # internal packages
        "voxel51-eta>=0.1.0.4",
    ],
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
    ],
    scripts=["fiftyone/fiftyone"],
    python_requires=">=2.7",
    cmdclass={"bdist_wheel": BdistWheelCustom},
)
