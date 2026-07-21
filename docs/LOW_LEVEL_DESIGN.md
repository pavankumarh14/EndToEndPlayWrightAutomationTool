# Low-Level Design

## Upload Processing

1. Receive Codegen script through `/api/analysis/upload`.
2. Detect language from extension and syntax.
3. Extract locators, actions, assertions, navigation, tags, data usage, and workflow intent deterministically.
4. Build and persist a current framework index from the filesystem.
5. Retrieve similar workflows, page objects, and tests.
6. Optionally call the configured semantic provider with reduced context.
7. If a provider fails or is quota/rate limited, retain a visible fallback warning and continue with safe deterministic selection.
8. Select a compatible reusable page object when one has safe business and verification methods; otherwise generate a new page object.
9. Produce a confidence decision, governance report, quality result, and source-level impact report.
10. Return proposed files, evidence, warnings, change scope, and confidence metadata.

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

- Pages must use `<Workflow>Page.ts` names under `pages/`.
- Components must use `<Name>Component.ts` names under `components/`.
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
| GET | `/api/index` | Build and return current framework index |
| POST | `/api/index/rebuild` | Force deterministic re-index |
| GET | `/api/governance/report` | Repository governance report |
| POST | `/api/execution/run` | Run Playwright and return healing proposal on failure |
| POST | `/api/recording/sessions` | Start local Playwright Codegen from a URL |
| GET | `/api/recording/sessions/:id` | Read recording status/source |
| POST | `/api/recording/sessions/:id/stop` | Stop Codegen recording |
| POST | `/api/recording/sessions/:id/save` | Stage recorded source for upload |
| GET | `/api/git/status` | Git status and diff |
| POST | `/api/git/commit` | Commit approved changes |
| GET | `/api/git/pull-request-readiness` | Check GitHub CLI, authentication, remote, and branch prerequisites |
| POST | `/api/git/remote` | Configure GitHub repository remote |
| POST | `/api/git/auth/login` | Start GitHub CLI sign-in |
| POST | `/api/git/pull-request` | Create or update a draft pull request from approved files |
| POST | `/api/git/pull-request/close` | Close a draft pull request and optionally delete remote branch |
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

The API requires explicit approval in `/api/analysis/apply`. When GitHub prerequisites are met, the approved file set is committed on an isolated automation branch, pushed, and opened or updated as a draft PR. The API returns the local checkout to the default branch after the operation. Production hardening can add role-based approval and immutable audit records.
