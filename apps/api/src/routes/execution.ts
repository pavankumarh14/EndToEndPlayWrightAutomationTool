import { Router } from 'express';
import { ExecutionService, GeminiClient, OllamaClient, SelfHealingEngine } from '@platform/core';
import { config, repositoryRoot } from '../config.js';

export const executionRouter = Router();

executionRouter.post('/run', async (req, res, next) => {
  try {
    const result = await new ExecutionService(repositoryRoot).runPlaywright({
      filter: typeof req.body?.filter === 'string' ? req.body.filter : undefined,
      testFiles: Array.isArray(req.body?.testFiles)
        ? req.body.testFiles.filter((file: unknown): file is string => typeof file === 'string')
        : undefined,
      installMissingDependencies: req.body?.installMissingDependencies === true,
      runAccessibilityWithFunctional: req.body?.runAccessibilityWithFunctional === true,
    });
    const healing = result.passed
      ? undefined
      : await analyzeFailure(result.logs, result.artifacts.tracesPath);
    res.json({ result, healing });
  } catch (error) {
    next(error);
  }
});

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
