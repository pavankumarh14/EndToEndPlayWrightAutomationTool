import { existsSync } from 'node:fs';
import path from 'node:path';
import { defaultConfig } from '@platform/core';

function inferRepositoryRoot(): string {
  if (process.env.REPOSITORY_ROOT) return path.resolve(process.env.REPOSITORY_ROOT);
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '../..')];
  return candidates.find((candidate) => existsSync(path.join(candidate, 'playwright.config.ts'))) ?? process.cwd();
}

export const repositoryRoot = inferRepositoryRoot();
export const config = defaultConfig(repositoryRoot);
