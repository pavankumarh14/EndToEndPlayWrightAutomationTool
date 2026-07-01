import { Router } from 'express';
import { FrameworkIndexer, GovernanceEngine } from '@platform/core';
import { config } from '../config.js';

export const governanceRouter = Router();

governanceRouter.get('/report', async (_req, res, next) => {
  try {
    const index = await new FrameworkIndexer(config).buildIndex();
    const locatorReport = new GovernanceEngine().validateLocators(index.locators);
    const coverageWarnings = index.tests
      .filter((test) => !test.hasAccessibilityCoverage && test.filePath.startsWith('tests/functional/'))
      .map((test) => ({
        severity: 'warning',
        rule: 'accessibility-coverage',
        message: `Missing accessibility coverage for ${test.name}`,
        filePath: test.filePath
      }));
    res.json({
      passed: locatorReport.passed,
      violations: [...locatorReport.violations, ...coverageWarnings]
    });
  } catch (error) {
    next(error);
  }
});
