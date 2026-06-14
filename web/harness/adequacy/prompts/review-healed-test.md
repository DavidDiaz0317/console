# Review A Healed Visual/Login Test

Compare the original test to the healed test and reject the healed version if it weakens intent.

Look for:
- removed invariant annotations
- removed negative assertions
- removed URL assertions
- removed visual/layout assertions
- specific checks replaced with generic body-visible checks
- increased screenshot thresholds without an explicit allowlist
- removed ground-truth comparisons
- changed route under test
- deleted tests without equivalent replacements

Acceptance criterion:
The healed test must preserve or strengthen the original invariant protection.
