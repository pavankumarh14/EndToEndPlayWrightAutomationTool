import { FrameworkIndexer } from '@platform/core';
import { config } from '../config.js';

const indexer = new FrameworkIndexer(config);
const index = await indexer.buildIndex();
await indexer.persist(index);
console.log(`Indexed ${index.tokenStats.indexedFiles} files with ${index.tokenStats.tokenReductionPercent}% token reduction.`);
