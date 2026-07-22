import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import {
  analyzeUploadedScript,
  ConfidenceEngine,
  FrameworkIndexer,
  GovernanceEngine,
  ImpactAnalyzer,
  GeminiClient,
  OllamaClient,
  QualityGate,
  RetrievalEngine,
  selectReusablePageObject,
  FrameworkLearningEngine,
  applyLearningInfluence,
  generateAccessibilityTest,
  generateFunctionalTest,
  generateReusedFunctionalTest,
  generatePageObject
} from '@platform/core';
import { PageObjectModel } from '@platform/core';
import { config, repositoryRoot } from '../config.js';

const upload = multer({ dest: path.join(repositoryRoot, 'storage/uploads') });
export const analysisRouter = Router();

analysisRouter.post('/upload', upload.single('script'), async (req, res, next) => {
  try {
    const file = req.file;
    const source =
      file ? await fs.readFile(file.path, 'utf8') : typeof req.body.source === 'string' ? req.body.source : '';
    const fileName = file?.originalname ?? req.body.fileName ?? 'upload.spec.ts';
    const parsed = analyzeUploadedScript(source, fileName);
    const requestedWorkflowName = normalizeWorkflowName(req.body?.workflowName);
    if (requestedWorkflowName) {
      parsed.workflows = parsed.workflows.map((workflow) => ({
        ...workflow,
        name: requestedWorkflowName,
        intent: workflow.intent.replace(/^Workflow\s+[^;]+/, `Workflow ${requestedWorkflowName}`)
      }));
    }
    const indexer = new FrameworkIndexer(config);
    const persistedIndex = await indexer.buildIndex();
    // Keep the Project Library in sync with the analysis that the user is reviewing.
    // Otherwise a previously persisted snapshot can describe files that were removed.
    await indexer.persist(persistedIndex);
    const stagedFiles = parseStagedFiles(req.body?.stagedFiles);
    const index = {
      ...persistedIndex,
      pageObjects: [...persistedIndex.pageObjects, ...stagedPageObjects(stagedFiles)]
    };
    const workflow = parsed.workflows[0];
    const retrieval = new RetrievalEngine().retrieve(workflow, index);
    const semanticRequest = {
      task: 'Classify this as a new workflow or an update. If a reusable page object is appropriate, set selectedAsset to its exact filePath. Do not select an asset unless it is clearly compatible.',
      workflowSummary: workflow.intent,
      retrievedAssets: retrieval,
      similarityResults: retrieval.evidence
    };
    let semantic: Awaited<ReturnType<GeminiClient['decide']>> | undefined;
    let semanticFallbackMessage: string | undefined;
    try {
      semantic = config.semanticProvider === 'gemini'
        ? await new GeminiClient(config.gemini.apiKey, config.gemini.model).decide(semanticRequest)
        : await new OllamaClient(config.ollama.baseUrl, config.ollama.model, config.semanticProvider === 'ollama').decide(semanticRequest);
    } catch (error) {
      semanticFallbackMessage = aiFallbackMessage(error);
    }
    const reusablePageObject = selectReusablePageObject(workflow, retrieval.pageObjects, semantic?.selectedAsset);
    const similarityScore = Math.max(
      ...retrieval.workflows.map((candidate) =>
        Math.round(overlap(workflow.intent, `${candidate.name} ${candidate.intent}`))
      ),
      0
    );
    const confidence = new ConfidenceEngine().decide({
      subject: 'Upload classification and framework change',
      deterministicScore: Math.max(similarityScore, workflow.actions.length ? 82 : 50),
      semanticScore: semantic?.score,
      evidence: retrieval.evidence,
      retrievedAssetsUsed: [
        ...retrieval.workflows.map((item) => item.sourceFile ?? item.name),
        ...retrieval.pageObjects.map((item) => item.filePath)
      ],
      similarityMetrics: { workflowSimilarity: similarityScore, retrievedTokenEstimate: retrieval.tokenEstimate }
    });
    const pageClassName = `${toPascal(workflow.name)}Page`;
    const files = [
      ...(reusablePageObject
        ? [{
            path: `tests/functional/${toKebab(workflow.name)}.spec.ts`,
            content: generateReusedFunctionalTest(workflow, reusablePageObject),
            action: 'create' as const
          }]
        : [
            { path: `pages/${pageClassName}.ts`, content: generatePageObject(workflow, pageClassName), action: 'create' as const },
            {
              path: `tests/functional/${toKebab(workflow.name)}.spec.ts`,
              content: generateFunctionalTest(workflow, pageClassName),
              action: 'create' as const
            }
          ]),
      {
        path: `tests/accessibility/${toKebab(workflow.name)}.a11y.spec.ts`,
        content: generateAccessibilityTest(workflow, reusablePageObject ? undefined : pageClassName),
        action: 'create' as const
      }
    ];
    const governance = new GovernanceEngine().validateChange({ files });
    const impact = await new ImpactAnalyzer(repositoryRoot).analyze(files);
    const learning = new FrameworkLearningEngine(repositoryRoot);
    const learningInfluence = await learning.adaptiveInfluence({
      baseScore: confidence.score,
      recommendationType: 'upload-refactor',
      patterns: extractLearningPatterns(source, filesFromWorkflow(workflow.name)),
      governanceCompliant: governance.passed,
      similarityScore
    });
    const adaptiveConfidence = applyLearningInfluence(confidence, learningInfluence);
    const quality = new QualityGate().evaluate({
      governance,
      confidenceScore: adaptiveConfidence.score,
      hasFunctionalTest: true,
      hasAccessibilityTest: true
    });

    res.json({
      parsed,
      retrieval,
      confidence: adaptiveConfidence,
      governance,
      impact,
      quality,
      semanticReview: {
        provider: config.semanticProvider,
        model: config.semanticProvider === 'gemini' ? config.gemini.model : config.semanticProvider === 'ollama' ? config.ollama.model : undefined,
        status: semanticFallbackMessage ? 'fallback' : semantic ? 'used' : 'not-enabled',
        message: semanticFallbackMessage
      },
      proposedChange: {
        kind: reusablePageObject || similarityScore >= 80 ? 'existing-workflow-update' : 'new-test',
        files,
        auditSummary: reusablePageObject
          ? `${reusablePageObject.reason} A new functional test and accessibility test were generated without creating a duplicate page object.`
          : 'Generated from deterministic AST extraction, retrieval, governance validation, and confidence scoring.'
      }
    });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post('/feedback', async (req, res, next) => {
  try {
    const event = await new FrameworkLearningEngine(repositoryRoot).recordEvent({
      source: req.body.source ?? 'user-suggestion',
      action: req.body.action,
      recommendationType: req.body.recommendationType ?? 'upload-refactor',
      originalRecommendation: req.body.originalRecommendation ?? '',
      finalOutcome: req.body.finalOutcome,
      executionResult: req.body.executionResult ?? 'unknown',
      confidenceScore: req.body.confidenceScore,
      patterns: req.body.patterns ?? [],
      approved: req.body.approved === true,
      merged: req.body.merged,
      experimental: req.body.experimental,
      temporaryFailure: req.body.temporaryFailure
    });
    res.json({ recorded: event.approved, event });
  } catch (error) {
    next(error);
  }
});

analysisRouter.post('/apply', async (req, res, next) => {
  try {
    const { files, approved } = req.body as {
      files: Array<{ path: string; content: string; action: 'create' | 'update' }>;
      approved?: boolean;
    };
    if (!Array.isArray(files)) return res.status(400).json({ applied: false, message: 'A list of proposed files is required.' });
    const governance = new GovernanceEngine().validateChange({ files });
    if (!governance.passed) return res.status(422).json({ applied: false, governance });
    if (!approved) return res.status(409).json({ applied: false, message: 'Human approval required for non-auto changes.' });

    const repositoryPrefix = `${repositoryRoot}${path.sep}`;
    for (const file of files) {
      const absolute = path.resolve(repositoryRoot, file.path);
      if (!absolute.startsWith(repositoryPrefix)) {
        return res.status(400).json({ applied: false, message: `Invalid repository path: ${file.path}` });
      }
    }

    for (const file of files) {
      const absolute = path.resolve(repositoryRoot, file.path);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, file.content);
    }

    const indexer = new FrameworkIndexer(config);
    await indexer.persist(await indexer.buildIndex());
    await new FrameworkLearningEngine(repositoryRoot).recordEvent({
      source: 'user-suggestion',
      action: 'accepted',
      recommendationType: 'framework-change',
      originalRecommendation: files.map((file) => file.path).join(', '),
      finalOutcome: 'Approved generated framework assets were written to Git working tree and index was rebuilt.',
      executionResult: 'unknown',
      patterns: files.flatMap((file) => extractLearningPatterns(file.content, [file.path])),
      approved: true
    });
    res.json({ applied: true, governance });
  } catch (error) {
    next(error);
  }
});

function toPascal(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || 'Generated';
}

function parseStagedFiles(value: unknown): Array<{ path: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((file): file is { path: string; content: string } =>
      typeof file === 'object' && file !== null &&
      typeof (file as { path?: unknown }).path === 'string' &&
      typeof (file as { content?: unknown }).content === 'string'
    )
    .map((file) => ({ path: file.path.replace(/\\/g, '/').replace(/^\.\//, ''), content: file.content }))
    .filter((file) => (file.path.startsWith('pages/') || file.path.startsWith('components/')) && /\.(ts|tsx|js|jsx)$/.test(file.path));
}

function normalizeWorkflowName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) return undefined;
  if (name.length > 80) throw new Error('Test name must be 80 characters or fewer.');
  if (!/[a-zA-Z0-9]/.test(name)) throw new Error('Test name must include at least one letter or number.');
  return name;
}

function stagedPageObjects(files: Array<{ path: string; content: string }>): PageObjectModel[] {
  return files.map((file) => {
    const methodDetails = [...file.content.matchAll(/(?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?::[^ {]+)?\s*{/g)]
      .filter((match) => !['if', 'for', 'while', 'switch', 'constructor'].includes(match[1]))
      .map((match) => ({
        name: match[1],
        parameterCount: match[2].split(',').map((parameter) => parameter.trim()).filter(Boolean).length
      }));
    return {
      name: path.basename(file.path).replace(/\.(ts|tsx|js|jsx)$/, ''),
      filePath: file.path,
      className: file.content.match(/export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1],
      methods: methodDetails.map((method) => method.name),
      methodDetails,
      locators: []
    };
  });
}

function toKebab(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'generated';
}

function overlap(left: string, right: string): number {
  const l = new Set(left.toLowerCase().split(/\W+/).filter(Boolean));
  const r = new Set(right.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...l].filter((token) => r.has(token)).length;
  return ((intersection / (new Set([...l, ...r]).size || 1)) * 100);
}

function aiFallbackMessage(error: unknown): string {
  const details = String(error).toLowerCase();
  const quotaOrTokenLimit = /429|quota|resource_exhausted|rate limit|token limit|too many requests/.test(details);
  return quotaOrTokenLimit
    ? 'The configured AI provider reached a quota, rate, or token limit. The platform continued with the closest safe local match found by AST and project-index rules.'
    : 'The configured AI provider was unavailable. The platform continued with the closest safe local match found by AST and project-index rules.';
}

function filesFromWorkflow(workflowName: string): string[] {
  const pageClassName = `${toPascal(workflowName)}Page`;
  return [
    `pages/${pageClassName}.ts`,
    `tests/functional/${toKebab(workflowName)}.spec.ts`,
    `tests/accessibility/${toKebab(workflowName)}.a11y.spec.ts`
  ];
}

function extractLearningPatterns(source: string, filePaths: string[]): string[] {
  const patterns = new Set<string>();
  for (const filePath of filePaths) {
    if (filePath.startsWith('pages/')) patterns.add('page-object:action-plus-verification-methods');
    if (filePath.startsWith('components/')) patterns.add('component:reusable-component-object');
    if (filePath.startsWith('tests/accessibility/')) patterns.add('accessibility:wcag-2.1-aa');
    if (filePath.startsWith('tests/functional/')) patterns.add('test:business-workflow-only');
  }
  if (/getByRole\(/.test(source)) patterns.add('locator:getByRole');
  if (/getByLabel\(/.test(source)) patterns.add('locator:getByLabel');
  if (/getByText\(/.test(source)) patterns.add('locator:getByText');
  if (/getByTestId\(/.test(source)) patterns.add('locator:getByTestId');
  if (/locator\(['"`](?:xpath=)?\/\//.test(source)) patterns.add('locator:xpath');
  if (/toBeVisible\(/.test(source)) patterns.add('assertion:expect(locator).toBeVisible');
  if (/toHaveText\(/.test(source)) patterns.add('assertion:expect(locator).toHaveText');
  if (/waitForTimeout\(/.test(source)) patterns.add('wait:fixed-timeout');
  if (/toHaveURL\(/.test(source)) patterns.add('wait:web-first-assertions');
  return [...patterns];
}
