import type { Express } from 'express';
import { analysisRouter } from './analysis.js';
import { indexRouter } from './indexing.js';
import { governanceRouter } from './governance.js';
import { executionRouter } from './execution.js';
import { gitRouter } from './git.js';
import { learningRouter } from './learning.js';
import { recordingRouter } from './recording.js';

export function registerRoutes(app: Express): void {
  app.get('/', (_req, res) =>
    res.json({
      name: 'Enterprise Playwright Platform API',
      ok: true,
      health: '/api/health',
      routes: [
        '/api/analysis',
        '/api/index',
        '/api/governance',
        '/api/execution',
        '/api/git',
        '/api/learning',
        '/api/recording'
      ]
    })
  );
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/analysis', analysisRouter);
  app.use('/api/index', indexRouter);
  app.use('/api/governance', governanceRouter);
  app.use('/api/execution', executionRouter);
  app.use('/api/git', gitRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/recording', recordingRouter);
}
