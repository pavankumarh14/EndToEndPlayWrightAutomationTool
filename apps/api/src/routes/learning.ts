import { Router } from 'express';
import { FrameworkLearningEngine } from '@platform/core';
import { repositoryRoot } from '../config.js';

export const learningRouter = Router();

learningRouter.get('/profile', async (_req, res, next) => {
  try {
    res.json(await new FrameworkLearningEngine(repositoryRoot).getProfile());
  } catch (error) {
    next(error);
  }
});

learningRouter.get('/dashboard', async (_req, res, next) => {
  try {
    res.json(await new FrameworkLearningEngine(repositoryRoot).getDashboard());
  } catch (error) {
    next(error);
  }
});

learningRouter.get('/events', async (_req, res, next) => {
  try {
    res.json(await new FrameworkLearningEngine(repositoryRoot).readEvents());
  } catch (error) {
    next(error);
  }
});
