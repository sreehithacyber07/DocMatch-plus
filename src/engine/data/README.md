# R2 knowledge architecture and demonstration layer

The production knowledge definition is structurally valid but deliberately blocked from engine materialization. No reviewed clinical routing prior or numerical `P(answer | specialty)` evidence was supplied for R2.

`knowledge.ts` contains production-bound definitions. It contains no synthetic probability values. Synthetic values exist only under `fixtures/` and are marked with synthetic-only provenance.

`evidence.ts` records the mandatory A–E evidence classification. Clinical wording and remaining complaint scope require review; routing priors and likelihoods require direct quantitative support; urgent-assessment rules belong to R3; synthetic data remains test-only.

R2B adds a third, explicit `demonstration` mode under `demonstration/`. Its question concepts have reviewed qualitative provenance, while every numerical prior and likelihood is labeled `demonstration_only` and references the shared prototype policy. `materializeDemonstrationComplaint` is the only supported path for this data. Production materialization rejects it.

Validate R2 structure and readiness:

```sh
node src/engine/data/validate.ts
```

Run the blocked regression report:

```sh
node src/engine/data/run-regressions.ts
```

Run R2 tests:

```sh
node --test src/engine/data/tests/knowledge.test.ts
```

Validate and run R2B:

```sh
node src/engine/data/validate-demonstration.ts
node src/engine/data/run-demonstration-regressions.ts
node --test src/engine/data/tests/demonstration.test.ts
```
