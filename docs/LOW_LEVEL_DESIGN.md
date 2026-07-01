# Low-Level Design

## Upload Processing

1. Receive Codegen script through `/api/analysis/upload`.
2. Detect language from extension and syntax.
3. Extract locators, actions, assertions, navigation, tags, data usage, and workflow intent deterministically.
4. Build or load the framework index.
5. Retrieve similar workflows, page objects, and tests.
6. Optionally call Ollama with reduced semantic context.
7. Produce a confidence decision.
8. Generate POM, functional test, and accessibility test proposals.
9. Run governance and quality gates.
10. Return proposed files, evidence, warnings, and confidence metadata.

## Deterministic Analysis Contract

The following must never use AI:

- Locator extraction
- Method extraction
- Class extraction
- Test step extraction
- Assertion extraction
- Structural code analysis

Current implementation provides deterministic extractors in `packages/core/src/ast`. The package is dependency-ready for `ts-morph`, Babel, and Tree-sitter expansion.

## Governance Rules

- Pages must use `LoginPage.ts` style names under `pages/`.
- Components must use `HeaderComponent.ts` style names under `components/`.
- Functional tests must live in `tests/functional`.
- Accessibility tests must live in `tests/accessibility`.
- Test files must call page-object workflows, not raw Playwright locators.
- Locator priority is role, label, placeholder, text, test id, CSS, XPath.
- XPath, dynamic selectors, index selectors, duplicate locators, and ignored reusable assets are flagged.

## REST API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| POST | `/api/analysis/upload` | Analyze uploaded script and propose framework assets |
| POST | `/api/analysis/feedback` | Capture Accept, Reject, or Modify feedback for a recommendation |
| POST | `/api/analysis/apply` | Apply approved proposed files and re-index |
| GET | `/api/index` | Load or build framework index |
| POST | `/api/index/rebuild` | Force deterministic re-index |
| GET | `/api/governance/report` | Repository governance report |
| POST | `/api/execution/run` | Run Playwright and return healing proposal on failure |
| GET | `/api/git/status` | Git status and diff |
| POST | `/api/git/commit` | Commit approved changes |
| GET | `/api/learning/profile` | Current Team Automation Profile |
| GET | `/api/learning/dashboard` | Learning dashboard metrics and trends |
| GET | `/api/learning/events` | Eligible learning event history |

## Learning Flow

1. Recommendation is generated with deterministic analysis, retrieval, governance, and base confidence.
2. Learning engine reads eligible historical events from `storage/learning/events.json`.
3. Team profile is generated from accepted and rejected patterns.
4. Adaptive confidence adjustment is calculated and attached to the recommendation.
5. UI displays why the recommendation was suggested and which learned standards influenced it.
6. User chooses Accept, Reject, or Modify.
7. Only approved eligible events are persisted and used in future recommendations.

## Source Layout

```text
apps/
  api/                 REST orchestration service
  web/                 React operations console
packages/
  core/                Deterministic engines and shared domain model
tests/
  functional/          Business workflow specs
  accessibility/       Axe/WCAG specs
pages/                 Page objects
components/            Reusable component objects
fixtures/              Test fixtures
utils/                 Test utilities
storage/
  audit/               Audit metadata
  indexes/             Generated framework index
```

## Approval Flow

The API currently requires explicit approval in `/api/analysis/apply`. Production hardening should add role-based approval, immutable audit records, and branch-policy aware commits.
