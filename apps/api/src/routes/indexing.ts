import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { FrameworkIndexer } from '@platform/core';
import { config, repositoryRoot } from '../config.js';

export const indexRouter = Router();

indexRouter.get('/', async (_req, res, next) => {
  try {
    const indexPath = path.join(repositoryRoot, config.indexOutputPath);
    try {
      res.json(JSON.parse(await fs.readFile(indexPath, 'utf8')));
    } catch {
      const index = await new FrameworkIndexer(config).buildIndex();
      await new FrameworkIndexer(config).persist(index);
      res.json(index);
    }
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
