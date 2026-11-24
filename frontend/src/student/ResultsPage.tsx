import type { ActivitySnapshot } from '@classroom/shared/projections/activity';
import { ResultsView } from '../components/ResultsView';

export function ResultsPage({ snapshot }: { snapshot: ActivitySnapshot }) {
  return <ResultsView snapshot={snapshot} />;
}
