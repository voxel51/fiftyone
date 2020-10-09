"""
Sets up flags used by GitHub Actions to determine which tests to run.
"""

import os

flags = {"run_integration": False}
ref = os.environ.get("GITHUB_REF", "")

if (
    ref.startswith("refs/heads/rel-")
    or ref.startswith("refs/heads/release-")
    or ref.startswith("refs/tags/v")
):
    flags["run_integration"] = True

for k, v in flags.items():
    v = str(v).lower()
    print("flag %s = %s" % (k, v))
    print("::set-output name=%s::%s" % (k, v))
