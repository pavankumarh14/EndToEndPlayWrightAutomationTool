# Upload-To-Commit Sequence

```text
User
  -> Studio: Upload/paste a script, or record one from a URL
  -> API: Submit the completed script for analysis
  -> AST: Extract actions, locators, assertions, and workflow structure
  -> Framework index: Build the current project-library view and find reuse candidates
  -> Optional AI provider: Review limited workflow metadata when available
  <- API: Return project rules, change scope, confidence, and proposed files

User
  -> Studio: Approve the reviewed proposal
  -> API: Apply only the approved files
  -> GitHub: Create or update the draft pull request
  <- Studio: Show the approval and pull-request result
```
