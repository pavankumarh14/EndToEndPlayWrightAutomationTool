# Upload-To-Commit Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant UI as React Console
  participant API as REST API
  participant AST as AST Engine
  participant IDX as Framework Indexer
  participant RET as Retrieval Engine
  participant AI as Ollama
  participant GOV as Governance
  participant GIT as Git

  U->>UI: Upload Playwright Codegen script
  UI->>API: POST /api/analysis/upload
  API->>AST: Extract actions, locators, assertions, workflow
  API->>IDX: Build framework index
  API->>RET: Retrieve similar assets
  RET-->>API: Narrow context and similarity evidence
  opt Semantic decision only
    API->>AI: Workflow summary + retrieved assets
    AI-->>API: Score and reasoning
  end
  API->>GOV: Validate generated proposal
  GOV-->>API: Governance report
  API-->>UI: Confidence, quality gates, proposed diff
  U->>UI: Approve change
  UI->>API: POST /api/analysis/apply
  API->>GIT: Write files and re-index
  API-->>UI: Applied result
```

