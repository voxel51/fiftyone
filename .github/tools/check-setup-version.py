"""
Scans a setup.py file for a version number
"""

import argparse
import os
import re

parser = argparse.ArgumentParser()
parser.add_argument("filename")
parser.add_argument("expected_version")
args = parser.parse_args()

if os.path.basename(args.filename) != "setup.py":
    raise ValueError("Invalid setup.py: %r" % args.filename)

with open(args.filename) as f:
    version = re.search(r'version="(.+?)"', f.read()).group(1)

if version == args.expected_version:
    print("OK")
else:
    print(
        "Invalid version: found %r, expected %r"
        % (version, args.expected_version)
    )
    exit(1)
