import argparse
import sys

import fiftyone as fo

parser = argparse.ArgumentParser()
parser.add_argument("--remote", action="store_true")
parser.add_argument("--slow", action="store_true")
args = parser.parse_args()

session = fo.launch_app(remote=args.remote)
if args.slow:
    assert isinstance(session._disable_wait_warning, bool)
    session._disable_wait_warning = True

session.__del__()
