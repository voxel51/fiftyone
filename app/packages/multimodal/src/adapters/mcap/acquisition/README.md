# MCAP acquisition

This directory owns format-private acquisition constraints that sit below the
neutral read ports. In particular, MCAP's physical chunk allowance is an
adapter implementation detail and must not leak upward into the runtime.
