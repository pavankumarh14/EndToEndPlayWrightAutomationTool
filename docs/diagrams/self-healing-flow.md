# Self-Healing Sequence

```text
Studio
  -> API: Run approved tests
  -> Playwright: Execute the test suite
  <- API: Receive logs and test artifacts
  -> Local failure analysis: Evaluate the error with deterministic rules
  -> Framework index: Find locator and reusable-asset candidates
  -> Optional AI provider: Review a reduced failure summary when available
  <- Studio: Show local or AI-assisted next-step guidance

User
  -> Studio: Review the guidance before making any change
```
