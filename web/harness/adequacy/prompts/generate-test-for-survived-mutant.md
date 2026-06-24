# Generate A Test For A Survived Visual/Login Mutant

Invariant ID: `{{invariantId}}`
Mutation ID: `{{mutationId}}`
Observed survived behavior: `{{observedBehavior}}`
Expected failing test: `{{expectedFailingTest}}`

Current weak tests:
`{{weakTests}}`

Required assertions:
- Assert the protected invariant directly.
- Include a route/URL assertion when auth or login behavior is involved.
- Include negative assertions for forbidden login/auth states.
- Include a positive assertion for recognizable dashboard/demo content.
- Use accessible locators or stable test ids.

Forbidden weak patterns:
- `expect(true).toBe(true)`
- no `expect` calls
- `body` visibility as the only assertion
- arbitrary `waitForTimeout`
- loosening screenshot thresholds to make the test pass

Acceptance criterion:
The generated test must kill mutation `{{mutationId}}` and remain mapped to invariant `{{invariantId}}`.
