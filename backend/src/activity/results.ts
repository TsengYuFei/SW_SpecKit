import type { Activity } from './store.js';
import { AppError } from '../security/safe-errors.js';

export function publishedResults(activity: Activity) {
  if (activity.phase !== 'ended' || !activity.finalResults) throw new AppError('INVALID_PHASE');
  return structuredClone(activity.finalResults);
}
