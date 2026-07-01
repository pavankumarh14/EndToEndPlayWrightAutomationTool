import { SimilarityResult } from '../types/domain.js';

export class SimilarityEngine {
  rank<T>(query: string, candidates: T[], toText: (candidate: T) => string): SimilarityResult<T>[] {
    return candidates
      .map((asset) => {
        const evidence = sharedTerms(query, toText(asset));
        return {
          asset,
          score: jaccard(query, toText(asset)),
          evidence
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}

function jaccard(left: string, right: string): number {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size || 1;
  return Math.round((intersection / union) * 100);
}

function sharedTerms(left: string, right: string): string[] {
  const rightTokens = new Set(tokenize(right));
  return [...new Set(tokenize(left).filter((token) => rightTokens.has(token)))].slice(0, 8);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9@_-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}
