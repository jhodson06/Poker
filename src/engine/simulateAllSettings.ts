import {
  createInitialTableState,
  startNewHand,
  executePlayerAction,
  TableState
} from './stateMachine';
import { sampleOpponentAiAction } from '../gto/opponentAi';
import { getGtoStrategyForState } from '../gto/strategyDatabase';
import { evaluateUserDecision } from '../pedagogy/evCalculator';
import { evaluate7Cards } from './evaluator';

console.log('====================================================');
console.log('⚡ MULTI-SETTING PROGRAMMATIC SIMULATION RUNNER');
console.log('====================================================');

const playerCounts = [2, 3, 4, 5, 6];
const stackDepths = [50, 100, 200];
const handsPerSetting = 50;

let totalHandsSimulated = 0;
let totalActionsExecuted = 0;
let totalErrors = 0;

playerCounts.forEach(count => {
  stackDepths.forEach(stack => {
    console.log(`\n▶ Testing Config: ${count} Players | ${stack} BB Stack Depths (${handsPerSetting} Hands)...`);

    let state: TableState = createInitialTableState(count, stack);
    let settingErrors = 0;

    for (let h = 0; h < handsPerSetting; h++) {
      state = startNewHand(state);
      totalHandsSimulated++;

      let turns = 0;
      const maxTurns = 60;

      while (state.street !== 'showdown' && turns < maxTurns) {
        turns++;
        totalActionsExecuted++;

        // 1. Verify Pot Math Consistency
        const expectedPot = state.players.reduce((sum, p) => sum + p.totalInvested, 0);
        if (state.pot !== expectedPot) {
          console.error(`  ❌ Pot mismatch! State: ${state.pot}, Expected: ${expectedPot}`);
          settingErrors++;
        }

        // 2. Sample AI / Player Action
        const aiDecision = sampleOpponentAiAction(state);

        // 3. Verify EV Grading Calculation for active player
        const activePlayer = state.players[aiDecision.seatIndex];
        if (activePlayer && activePlayer.holeCards.length === 2) {
          const strategyNode = getGtoStrategyForState(
            activePlayer.holeCards[0],
            activePlayer.holeCards[1],
            activePlayer.position,
            state.street,
            state.currentHighBet,
            state.pot,
            state.bigBlind,
            state.communityCards
          );
          const grading = evaluateUserDecision(aiDecision.action, aiDecision.amount, strategyNode);
          if (!grading || !grading.grade || !['Correct', 'Inaccuracy', 'Mistake', 'Blunder'].includes(grading.grade)) {
            console.error(`  ❌ Decision Grading Error on Hand ${h}: Invalid grade ${grading?.grade}`);
            settingErrors++;
          }
        }

        // 4. Advance State & Verify Invariant Conservation
        const beforeChips = state.pot + state.players.reduce((sum, p) => sum + p.chips, 0);
        state = executePlayerAction(state, aiDecision.seatIndex, aiDecision.action, aiDecision.amount);
        const afterChips = state.pot + state.players.reduce((sum, p) => sum + p.chips, 0);

        if (beforeChips !== afterChips) {
          console.error(`  ❌ Action Execution Chip Leak! Before: ${beforeChips}, After: ${afterChips}`);
          settingErrors++;
        }
      } // end while

      // 5. Showdown Hand Evaluation & Winner Soundness Assertion
      if (state.street === 'showdown' && state.winners && state.winners.length > 0) {
        const active = state.players.filter(p => !p.isFolded && p.holeCards.length === 2);
        if (active.length >= 2 && state.communityCards.length >= 5) {
          const evals = active.map(p => ({
            seatIndex: p.seatIndex,
            eval: evaluate7Cards([...p.holeCards, ...state.communityCards])
          }));
          evals.sort((a, b) => a.eval.score - b.eval.score);
          const topScore = evals[0].eval.score;
          const bestSeats = evals.filter(e => e.eval.score === topScore).map(e => e.seatIndex);

          // Assert winner(s) recorded in state.winners match the best evaluation seats
          const winnerSeats = state.winners.map(w => w.seatIndex);
          const isMatch = bestSeats.every(s => winnerSeats.includes(s));
          if (!isMatch) {
            console.error(`  ❌ Showdown Winner Mismatch! Expected seats [${bestSeats.join(',')}], got [${winnerSeats.join(',')}]`);
            settingErrors++;
          }
        }
      }
    } // end for hands

    if (settingErrors === 0) {
      console.log(`  ✅ ${count}-Players / ${stack}BB: Passed 100% clean (${handsPerSetting} hands).`);
    } else {
      console.error(`  ❌ ${count}-Players / ${stack}BB: Encountered ${settingErrors} errors.`);
      totalErrors += settingErrors;
    }
  });
});

console.log('\n====================================================');
console.log(`📊 SIMULATION COMPLETE SUMMARY:`);
console.log(`- Total Hands Simulated: ${totalHandsSimulated}`);
console.log(`- Total Actions Processed: ${totalActionsExecuted}`);
console.log(`- Total Configurations Verified: ${playerCounts.length * stackDepths.length}`);
console.log(`- Total Engine Errors: ${totalErrors}`);
console.log('====================================================');

if (totalErrors > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
