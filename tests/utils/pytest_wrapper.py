"""
Wrapper around pytest that cleans up subprocesses
"""

import sys

import psutil
import pytest

try:
    pytest.main(sys.argv[1:])
finally:
    for child in psutil.Process().children(recursive=True):
        try:
            child.kill()
        except psutil.Error:
            pass
