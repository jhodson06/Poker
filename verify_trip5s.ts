import { createCard } from './src/engine/card';
import { getGtoStrategyForState } from './src/gto/strategyDatabase';

// Hero hole cards: 5H 5D
const c1 = createCard('5', 'h');
const c2 = createCard('5', 'd');

// Board: 5S 4S TS QS AS (4 spades)
const board = [
  createCard('5', 's'),
  createCard('4', 's'),
  createCard('T', 's'),
  createCard('Q', 's'),
  createCard('A', 's')
];

console.log("Testing Trip 5s on 4-flush board against River Bet (Pot: 100, Bet: 67)...");

// Simulate being on the River, facing a bet
const strategy = getGtoStrategyForState(
  c1, c2,
  'CO', // Position
  'river', // Street
  67, // currentHighBet
  100, // potSize
  2, // bigBlind
  board,
  1 // raiseCount
);

console.log("=== STRATEGY FOR 5H 5D ===");
console.log(`Optimal Action: ${strategy.optimalAction.label} (${strategy.optimalAction.frequency.toFixed(2)})`);
strategy.frequencies.forEach(f => {
  console.log(`- ${f.label}: ${f.frequency.toFixed(2)}`);
});
