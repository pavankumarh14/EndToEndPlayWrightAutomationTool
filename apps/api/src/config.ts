import path from 'node:path';
import { defaultConfig } from '@platform/core';

export const repositoryRoot = path.resolve(process.env.REPOSITORY_ROOT ?? path.join(process.cwd(), '../..'));
export const config = defaultConfig(repositoryRoot);
