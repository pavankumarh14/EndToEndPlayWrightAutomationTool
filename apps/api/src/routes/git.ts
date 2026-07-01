import { Router } from 'express';
import { GitService } from '@platform/core';
import { repositoryRoot } from '../config.js';

export const gitRouter = Router();

gitRouter.get('/status', async (_req, res, next) => {
  try {
    const git = new GitService(repositoryRoot);
    res.json({ status: await git.status(), diff: await git.diff() });
  } catch (error) {
    res.status(409).json({ error: 'Git repository is not initialized', detail: String(error) });
  }
});

gitRouter.post('/commit', async (req, res, next) => {
  try {
    const output = await new GitService(repositoryRoot).commit(req.body?.message ?? 'Apply automation platform changes');
    res.json({ output });
  } catch (error) {
    next(error);
  }
});
