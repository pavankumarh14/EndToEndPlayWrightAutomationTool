import { Router } from 'express';
import { ExecutionService, SelfHealingEngine } from '@platform/core';
import { repositoryRoot } from '../config.js';

export const executionRouter = Router();

executionRouter.post('/run', async (req, res, next) => {
  try {
    const result = await new ExecutionService(repositoryRoot).runPlaywright({
      filter: typeof req.body?.filter === 'string' ? req.body.filter : undefined,
      installMissingDependencies: req.body?.installMissingDependencies === true,
      runAccessibilityWithFunctional: req.body?.runAccessibilityWithFunctional === true
    });
    const healing = result.passed ? undefined : new SelfHealingEngine().propose({ logs: result.logs });
    res.json({ result, healing });
  } catch (error) {
    next(error);
  }
});
