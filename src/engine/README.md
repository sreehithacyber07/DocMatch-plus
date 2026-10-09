# R1 adaptive routing engine

This directory contains the deterministic TypeScript engine only. It imports no React, Zustand, DOM, backend, or clinical knowledge module.

All data in `fixtures/synthetic.ts` is synthetic and exists only to exercise mathematical and control-flow behavior. It is not medical evidence and must not be used for patient routing.

The default posterior floor is `0.02`. Stopping thresholds are mandatory caller configuration because no clinical or founder-approved defaults were supplied for them in R1.

Run the tests with:

```sh
node --test src/engine/tests/engine.test.ts
```

Run the three-answer simulator with:

```sh
node src/engine/simulate.ts synthetic-routing-demo signal-north texture-a tempo-steady
```
