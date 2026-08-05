import { RiverSolver, GameState } from './cfrSolver';
import { getStaticPreflopRange, Range } from './rangeBuilder';
import { Card } from './card';

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  if (type === 'SOLVE_RIVER') {
    const { board, pot, p1Stack, p2Stack, isP1Turn, history, iterations } = payload;
    
    // Convert plain objects to Card objects
    const boardCards: Card[] = board.map((c: any) => ({ value: c.value, suit: c.suit }));
    
    const initialState: GameState = {
      board: boardCards,
      pot,
      p1Stack,
      p2Stack,
      isP1Turn,
      history,
      terminal: false,
      p1Commit: 0,
      p2Commit: 0,
    };

    // For a real solver, we'd pass in accurate narrowed ranges.
    // Here we use static ranges for prototype demonstration.
    const p1Range = getStaticPreflopRange(30); // Top 30% hands for P1
    const p2Range = getStaticPreflopRange(50); // Top 50% hands for P2
    
    p1Range.removeBlockers(boardCards);
    p2Range.removeBlockers(boardCards);
    p1Range.normalize();
    p2Range.normalize();

    const solver = new RiverSolver(boardCards);
    solver.solve(initialState, p1Range, p2Range, iterations || 100);

    // After solving, we want to return the average strategy for the root node
    const rootInfoset = (isP1Turn ? 'P1' : 'P2') + '|' + history.join(',');
    
    // Instead of sending back the massive 1326 Float32Array (which we could do),
    // we'll send back the strategy map for all hands so the UI can query it.
    // A Float32Array is easily transferable.
    // Wait, the UI just wants the strategy for the *specific* hole cards of the hero!
    // But to render the whole SolutionBrowser grid, we need the strategy for ALL hands.
    // So we'll pack the strategy into a single large Float32Array.
    
    const node = (solver as any).nodeMap.get(rootInfoset);
    if (!node) {
      self.postMessage({ type: 'SOLVE_RIVER_RESULT', payload: null });
      return;
    }
    
    const numActions = node.actions.length;
    const strategyData = new Float32Array(1326 * numActions);
    
    for (let h = 0; h < 1326; h++) {
      const avgStrat = solver.getAverageStrategy(rootInfoset, h);
      if (avgStrat) {
        for (let a = 0; a < numActions; a++) {
          strategyData[h * numActions + a] = avgStrat[a];
        }
      }
    }
    
    self.postMessage({
      type: 'SOLVE_RIVER_RESULT',
      payload: {
        actions: node.actions,
        strategyData,
      }
    });
  }
};
