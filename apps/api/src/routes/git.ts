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

gitRouter.get('/pull-request-readiness', async (_req, res, next) => {
  try {
    res.json(await new GitService(repositoryRoot).pullRequestReadiness());
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to check GitHub pull request readiness.' });
  }
});

gitRouter.post('/remote', async (req, res, next) => {
  try {
    const remote = typeof req.body?.remote === 'string' ? req.body.remote.trim() : '';
    res.json(await new GitService(repositoryRoot).setOrigin(remote));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to configure the GitHub repository.' });
  }
});

gitRouter.post('/auth/login', async (_req, res) => {
  try {
    const message = await new GitService(repositoryRoot).startGitHubLogin();
    res.status(202).json({ started: true, message });
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to start GitHub sign-in.' });
  }
});

gitRouter.post('/pull-request', async (req, res, next) => {
  try {
    const files = Array.isArray(req.body?.files) ? req.body.files.filter((file: unknown): file is string => typeof file === 'string') : [];
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!title || !body) return res.status(400).json({ message: 'A pull request title and description are required.' });
    res.status(201).json(await new GitService(repositoryRoot).createDraftPullRequest({ files, title, body }));
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to create the GitHub pull request.' });
  }
});

gitRouter.post('/pull-request/close', async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch : '';
    const deleteRemoteBranch = req.body?.deleteRemoteBranch === true;
    res.json(await new GitService(repositoryRoot).closePullRequest({ url, branch, deleteRemoteBranch }));
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : 'Unable to close the GitHub pull request.' });
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
