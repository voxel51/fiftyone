#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel


class BdistWheelCustom(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # make just the wheel require these packages, since they aren't needed
        # for a development installation
        self.distribution.install_requires += [
            "fiftyone-brain>=0.1.5",
            "fiftyone-gui>=0.2.2",
            "fiftyone-db>=0.1.1",
        ]


setup(
    name="fiftyone",
    version="0.4.0",
    description=(
        "FiftyOne: a powerful package for dataset curation, analysis, and "
        "visualization"
    ),
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=find_packages() + ["fiftyone.recipes", "fiftyone.tutorials"],
    package_dir={
        "fiftyone.recipes": "docs/source/recipes",
        "fiftyone.tutorials": "docs/source/tutorials",
    },
    include_package_data=True,
    install_requires=[
        # third-party packages
        "argcomplete",
        "eventlet",
        "Flask",
        "flask-socketio",
        "future",
        "Jinja2",
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
        "xmltodict",
        # internal packages
        "voxel51-eta>=0.1.2",
    ],
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 3",
    ],
    entry_points={"console_scripts": ["fiftyone=fiftyone.core.cli:main"]},
    python_requires=">=3.5",
    cmdclass={"bdist_wheel": BdistWheelCustom},
)
