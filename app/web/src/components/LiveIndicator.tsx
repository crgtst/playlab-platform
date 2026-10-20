import { useRealtimeState } from '../context/RealtimeContext';

const LABEL = { idle: 'Live updates off', connecting: 'Connecting…', open: 'Live updates on', closed: 'Reconnecting…' };

/** Shows the order WebSocket state; tests can wait for data-state="open". */
export function LiveIndicator({ testId = 'live-indicator' }: { testId?: string }) {
  const state = useRealtimeState();
  return (
    <span className={`live live-${state}`} data-testid={testId} data-state={state}>
      <span aria-hidden="true">●</span> {LABEL[state]}
    </span>
  );
}
