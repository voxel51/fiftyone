# testing

This is executable architecture, not a second home for ordinary unit tests.

Testing holds shared behavioral contracts and cross-layer harnesses. It proves
that different adapters expose the same session semantics and that production
composition works through public boundaries.

Keep narrow tests beside the code they exercise. Put a test here when several
implementations must pass the same contract or when the boundary itself is the
subject under test.

Test-only renderers and cross-layer fixtures also live here rather than in a
production view namespace. Their broader dependencies are part of the harness,
not an application architecture contract.
