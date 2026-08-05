# Pending App Changes

This document tracks features, mechanics, and optimizations that were stripped down, disabled, or mocked for the Browser/Web prototype of the Poker Trainer, but **must be restored or implemented** for the final Desktop App / Steam release.

### 1. High-Iteration CFR Engine Solving
- **Current (Web):** The `cfrSolver.ts` engine is hard-capped at 20 iterations (`SOLVER_ITERATIONS`) when evaluating River strategies to prevent blocking the browser's main UI thread and freezing the app.
- **Pending (Final App):** 
  - The final app needs to scale this back up to **100+ iterations** for true GTO convergence accuracy.
  - This requires moving the solver to a dedicated Web Worker thread (`solverWorker.ts`) or migrating it to a native C++ addon if using a Node/Electron backend, so it can run asynchronously without freezing the UI.

### 2. Flop and Turn CFR Engine Extensions
- **Current (Web):** Real-time CFR is only implemented for the **River**. Flop and Turn use placeholder fallback strategies.
- **Pending (Final App):**
  - Implement full Flop and Turn CFR solving. 
  - This requires significantly more computational power (handling multiple streets of lookahead and massive abstraction buckets). It will absolutely require the Web Worker / Native Backend architecture mentioned above.

### 3. Preflop Chart Database Scaling
- **Current (Web):** 100BB 6-Max Preflop charts are hardcoded as a static object directly in `src/gto/preflopCharts.ts`.
- **Pending (Final App):**
  - Implement dynamic `.json` file loading from disk to support multiple stack sizes (50BB, 200BB) and player counts (Heads-Up, 9-max).
  - Web browsers cannot dynamically read arbitrarily large directories of JSON files synchronously, but a desktop app can stream them into memory instantly.

### 4. Native Node.js Dependencies (`poker-evaluator`)
- **Current (Web):** We removed `poker-evaluator` (which relied on Node's `fs` and `path` modules) and replaced it with a custom native TypeScript `evaluate7Cards` function to make the Vite web build compile cleanly.
- **Pending (Final App):**
  - If performance becomes a bottleneck for Flop/Turn solving, the final app can safely restore highly-optimized C/C++ evaluator libraries (like `poker-evaluator`) since the desktop runtime (Electron/Tauri/Node) has full OS-level module access.
