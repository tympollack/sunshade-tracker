/// <reference lib="webworker" />
import {
  runMonteCarloSimulation,
  MonteCarloSimulationInput,
  MonteCarloSimulationResult,
} from '../lib/analytics/monte-carlo';

addEventListener('message', (event: MessageEvent<MonteCarloSimulationInput>) => {
  try {
    const result: MonteCarloSimulationResult = runMonteCarloSimulation(event.data);
    postMessage(result);
  } catch (err) {
    // Post empty or error payload so caller doesn't hang
    postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
