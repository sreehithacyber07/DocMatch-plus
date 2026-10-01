/// <reference types="node" />

import { formatDemonstrationRegression, runAllDemonstrationRegressions } from './demonstration/regression.ts';

console.log(runAllDemonstrationRegressions().map(formatDemonstrationRegression).join('\n\n'));
