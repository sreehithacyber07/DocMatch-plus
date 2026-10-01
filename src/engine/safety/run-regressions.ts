import { formatSafetyRegression, runAllSafetyRegressions } from './regressions.ts';

for (const result of runAllSafetyRegressions()) {
  process.stdout.write(`${formatSafetyRegression(result)}\n\n`);
}
