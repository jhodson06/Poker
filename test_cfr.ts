import { RiverSolver, GameState } from './src/engine/cfrSolver';
import { getStaticPreflopRange } from './src/engine/rangeBuilder';
import { createCard } from './src/engine/card';

const board = [
  createCard('A', 'c'),
  createCard('K', 'c'),
  createCard('Q', 'c'),
  createCard('2', 's'),
  createCard('3', 'h')
];

const state: GameState = {
  board,
  pot: 100,
  p1Stack: 1000,
  p2Stack: 1000,
  isP1Turn: true,
  history: [],
  terminal: false,
  p1Commit: 0,
  p2Commit: 0
};

const p1Range = getStaticPreflopRange(30);
const p2Range = getStaticPreflopRange(50);
p1Range.removeBlockers(board);
p2Range.removeBlockers(board);
p1Range.normalize();
p2Range.normalize();

console.time('RiverSolver 100 iterations');
const solver = new RiverSolver(board);
solver.solve(state, p1Range, p2Range, 100);
console.timeEnd('RiverSolver 100 iterations');

console.time('RiverSolver 500 iterations');
const solver2 = new RiverSolver(board);
solver2.solve(state, p1Range, p2Range, 500);
console.timeEnd('RiverSolver 500 iterations');
