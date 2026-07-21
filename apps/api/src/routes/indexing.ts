import { Router } from 'express';
import { FrameworkIndexer } from '@platform/core';
import { config } from '../config.js';

export const indexRouter = Router();

indexRouter.get('/', async (_req, res, next) => {
  try {
    // The library is the current filesystem view, not a historical cache.
    // Rebuild on read so deleted/approved files are immediately reflected.
    const indexer = new FrameworkIndexer(config);
    const index = await indexer.buildIndex();
    await indexer.persist(index);
    res.json(index);
  } catch (error) {
    next(error);
  }
});

indexRouter.post('/rebuild', async (_req, res, next) => {
  try {
    const indexer = new FrameworkIndexer(config);
    const index = await indexer.buildIndex();
    await indexer.persist(index);
    res.json(index);
  } catch (error) {
    next(error);
  }
});
