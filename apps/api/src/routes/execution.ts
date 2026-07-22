import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { ExecutionService, GeminiClient, OllamaClient, SelfHealingEngine } from '@platform/core';
import { config, repositoryRoot } from '../config.js';

export const executionRouter = Router();

executionRouter.post('/run', async (req, res, next) => {
  try {
    const service = new ExecutionService(repositoryRoot);
    const options = {
      filter: typeof req.body?.filter === 'string' ? req.body.filter : undefined,
      testFiles: Array.isArray(req.body?.testFiles)
        ? req.body.testFiles.filter((file: unknown): file is string => typeof file === 'string')
        : undefined,
      installMissingDependencies: req.body?.installMissingDependencies === true,
      runAccessibilityWithFunctional: req.body?.runAccessibilityWithFunctional === true,
    };
    const proposedFiles = Array.isArray(req.body?.proposedFiles)
      ? req.body.proposedFiles.filter(
          (file: unknown): file is { path: string; content: string } =>
            typeof (file as { path?: unknown })?.path === 'string' &&
            typeof (file as { content?: unknown })?.content === 'string',
        )
      : [];
    const result = proposedFiles.length
      ? await service.runProposedFiles(proposedFiles, options)
      : typeof req.body?.source === 'string'
      ? await service.runUploadedScript(
          req.body.source,
          typeof req.body?.fileName === 'string' ? req.body.fileName : 'uploaded.spec.ts',
          options,
        )
      : await service.runPlaywright(options);
    const healing = result.passed
      ? undefined
      : await analyzeFailure(result.logs, result.artifacts.tracesPath);
    const failureArtifacts = result.passed ? [] : await findFailureArtifacts(result.logs);
    res.json({
      result: {
        ...result,
        artifacts: { ...result.artifacts, files: failureArtifacts },
      },
      healing,
    });
  } catch (error) {
    next(error);
  }
});

executionRouter.get('/artifact', async (req, res, next) => {
  try {
    const relativePath = typeof req.query.path === 'string'
      ? req.query.path.replace(/\\/g, '/').replace(/^\.\//, '')
      : '';
    if (
      !relativePath.startsWith('test-results/') ||
      !/\.(png|webm|zip|md)$/i.test(relativePath)
    ) {
      return res.status(400).json({ message: 'Invalid test artifact path.' });
    }
    const absolutePath = path.resolve(repositoryRoot, relativePath);
    const allowedRoot = `${path.resolve(repositoryRoot, 'test-results')}${path.sep}`;
    if (!absolutePath.startsWith(allowedRoot)) {
      return res.status(400).json({ message: 'Invalid test artifact path.' });
    }
    await fs.access(absolutePath);
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
});

async function findFailureArtifacts(logs: string): Promise<string[]> {
  const candidates = [...logs.matchAll(/(test-results\/[\w./-]+\.(?:png|webm|zip|md))/g)]
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index);
  const found: string[] = [];
  for (const candidate of candidates) {
    const absolutePath = path.resolve(repositoryRoot, candidate);
    const allowedRoot = `${path.resolve(repositoryRoot, 'test-results')}${path.sep}`;
    if (!absolutePath.startsWith(allowedRoot)) continue;
    try {
      await fs.access(absolutePath);
      found.push(candidate);
    } catch {
      // Playwright can omit an artifact named in a partial failure log.
    }
  }
  return found;
}

async function analyzeFailure(logs: string, tracePath: string) {
  const healing = new SelfHealingEngine().propose({ logs, tracePath });
  // Deterministic locator findings are already actionable. AI is reserved for
  // ambiguous failures, and receives a short scrubbed failure summary only.
  if (
    healing.confidence.similarityMetrics.locatorFailure === 100 ||
    config.semanticProvider === 'none'
  )
    return healing;
  const request = {
    task: 'Identify the most likely root cause of this Playwright test failure. Do not generate code. Return a concise explanation and a 0-100 confidence score.',
    workflowSummary: scrubFailureLogs(logs),
    retrievedAssets: { tracePath, deterministicFinding: healing.rootCause },
    similarityResults: [],
  };
  try {
    const decision =
      config.semanticProvider === 'gemini'
        ? await new GeminiClient(config.gemini.apiKey, config.gemini.model).decide(request)
        : await new OllamaClient(config.ollama.baseUrl, config.ollama.model, true).decide(request);
    if (!decision) return healing;
    return {
      ...healing,
      rootCause: decision.reasoningSummary,
      analysisSource: 'ai-assisted' as const,
      aiMessage: `${config.semanticProvider === 'gemini' ? 'Gemini' : 'Ollama'} reviewed a scrubbed failure summary after deterministic triage.`,
      nextAction:
        'Review this AI-assisted suggestion, make the smallest safe change, then run the selected test again. No files were changed automatically.',
    };
  } catch (error) {
    return {
      ...healing,
      analysisSource: 'ai-fallback' as const,
      aiMessage: `Optional AI review was unavailable (${String(error).slice(0, 160)}). Deterministic failure guidance is still available.`,
    };
  }
}

function scrubFailureLogs(logs: string): string {
  return logs
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(token|api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s?]+\?[^\s]+/g, '[url-with-query]')
    .slice(0, 2_000);
}
