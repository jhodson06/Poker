import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Skull, X, Shuffle, Layers } from 'lucide-react';
import { DecisionGrading } from '../pedagogy/evCalculator';
import { GtoNodeStrategy, ActionFrequency, ActionTypeDB } from '../gto/strategyDatabase';

// All postflop bet actions (used for Simple Mode merging)
const ALL_BET_ACTIONS: ActionTypeDB[] = [
  'bet_33', 'bet_50', 'bet_67', 'bet_75',
  'bet_100', 'bet_150', 'bet_overbet', 'raise', 'allin'
];

interface FeedbackOverlayProps {
  grading: DecisionGrading;
  strategy: GtoNodeStrategy;
  difficultyMode?: 'simple' | 'standard';
  heroStack?: number;   // chips hero has left after the action (for SPR)
  potAfterBet?: number; // pot size after the action resolved (for SPR)
  onDismiss: () => void;
}

/**
 * In Simple Mode merge all bet/raise sizes into one "Bet / Raise" row.
 * In Standard Mode show only rows with frequency > 0%.
 */
function filterFrequencies(
  freqs: ActionFrequency[],
  mode: 'simple' | 'standard' | undefined
): ActionFrequency[] {
  if (mode === 'simple') {
    const nonBets = freqs.filter(f => !ALL_BET_ACTIONS.includes(f.action));
    const bets    = freqs.filter(f => ALL_BET_ACTIONS.includes(f.action));
    if (bets.length === 0) return nonBets.filter(f => f.frequency > 0);

    const totalBetFreq = bets.reduce((s, b) => s + b.frequency, 0);
    const weightedEv   = totalBetFreq > 0
      ? bets.reduce((s, b) => s + b.ev * b.frequency, 0) / totalBetFreq
      : bets[0].ev;

    const merged: ActionFrequency = {
      action: bets[0].action,
      label: 'Bet / Raise',
      frequency: totalBetFreq,
      ev: weightedEv,
    };

    return [...nonBets, merged].filter(f => f.frequency > 0);
  }

  // Standard mode: only show > 0% rows
  return freqs.filter(f => f.frequency > 0);
}

/** SPR category label and colour */
function getSprInfo(spr: number): { label: string; color: string } {
  if (spr >= 15) return { label: `SPR ${spr.toFixed(1)} — Very Deep`, color: 'text-cyan-400' };
  if (spr >=  8) return { label: `SPR ${spr.toFixed(1)} — Deep`,      color: 'text-blue-400' };
  if (spr >=  4) return { label: `SPR ${spr.toFixed(1)} — Medium`,    color: 'text-emerald-400' };
  if (spr >=  2) return { label: `SPR ${spr.toFixed(1)} — Low`,       color: 'text-amber-400' };
  return               { label: `SPR ${spr.toFixed(1)} — Committed`,  color: 'text-rose-400' };
}

/** Bar colour per action type */
function barColor(action: ActionTypeDB): string {
  if (action === 'fold')        return 'bg-slate-500';
  if (action === 'check')       return 'bg-blue-500';
  if (action === 'call')        return 'bg-emerald-500';
  if (action === 'bet_33')      return 'bg-teal-500';
  if (action === 'bet_50')      return 'bg-cyan-500';
  if (action === 'bet_67')      return 'bg-sky-500';
  if (action === 'bet_75')      return 'bg-indigo-500';
  if (action === 'bet_100')     return 'bg-violet-500';
  if (action === 'bet_150')     return 'bg-purple-500';
  if (action === 'bet_overbet') return 'bg-orange-500';
  if (action === 'allin')       return 'bg-rose-500';
  return 'bg-rose-500';
}

export const FeedbackOverlay: React.FC<FeedbackOverlayProps> = ({
  grading,
  strategy,
  difficultyMode,
  heroStack,
  potAfterBet,
  onDismiss,
}) => {
  const displayFreqs = filterFrequencies(strategy.frequencies, difficultyMode);

  // Detect indifference zone correct play (low-frequency but 0 EV loss)
  let effectiveUserFreq = grading.userActionFreq;
  if (difficultyMode === 'simple') {
    const isBet = ALL_BET_ACTIONS.includes(grading.userMatchedAction as ActionTypeDB);
    if (isBet) {
      const mergedBet = displayFreqs.find(f => f.label === 'Bet / Raise');
      if (mergedBet) effectiveUserFreq = mergedBet.frequency;
    }
  }

  const isIndifferenceCorrect =
    grading.grade === 'Correct' &&
    grading.evLoss === 0 &&
    effectiveUserFreq < 0.25 &&
    effectiveUserFreq > 0;

  // SPR calculation (postflop only, requires both props)
  const spr =
    heroStack !== undefined && potAfterBet !== undefined && potAfterBet > 0
      ? heroStack / potAfterBet
      : null;

  const getIcon = () => {
    switch (grading.grade) {
      case 'Correct':    return <CheckCircle2 className="w-8 h-8 text-emerald-400" />;
      case 'Inaccuracy': return <AlertTriangle className="w-8 h-8 text-amber-400" />;
      case 'Mistake':    return <XCircle className="w-8 h-8 text-rose-400" />;
      case 'Blunder':    return <Skull className="w-8 h-8 text-rose-500 animate-bounce" />;
    }
  };

  return (
    <div className="fixed bottom-28 right-6 z-50 max-w-md w-full glass-panel p-5 rounded-2xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">

      {/* ── Grade Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {getIcon()}
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${grading.badgeBgClass}`}>
                {grading.grade}
              </span>
              <span className="text-xs font-mono font-bold text-slate-300">
                EV Loss: -{grading.evLoss} BB
              </span>
              {spr !== null && strategy.street !== 'preflop' && (
                <span className={`text-[10px] font-mono font-bold ${getSprInfo(spr).color}`}>
                  · {getSprInfo(spr).label}
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-white mt-1">
              Your Choice: <span className="text-cyan-400">{grading.userActionLabel}</span>
            </h4>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-300 mt-2 font-medium leading-relaxed">
        {grading.explanation}
      </p>

      {/* ── Range Balance Reminder (indifference zone Correct) ────────────── */}
      {isIndifferenceCorrect && (
        <div className="mt-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-2.5">
          <Shuffle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-purple-200 leading-relaxed">
            <span className="font-extrabold text-purple-300">RANGE BALANCE REMINDER · </span>
            Your choice is 0 EV loss, but GTO plays{' '}
            <span className="font-bold text-white">
              {difficultyMode === 'simple' && ALL_BET_ACTIONS.includes(grading.userMatchedAction as ActionTypeDB)
                ? 'any Raise'
                : grading.userActionLabel}
            </span> only{' '}
            <span className="font-bold text-white">
              {((difficultyMode === 'simple' && ALL_BET_ACTIONS.includes(grading.userMatchedAction as ActionTypeDB)
                ? effectiveUserFreq
                : grading.userActionFreq) * 100).toFixed(0)}%
            </span> of the
            time. Over many hands, target this frequency to keep your range unexploitable — otherwise opponents can
            profitably deviate against your patterns.
          </div>
        </div>
      )}

      {/* ── SPR context note (if pot size was distorted by a custom bet) ──── */}
      {spr !== null && spr < 4 && strategy.street !== 'preflop' && (
        <div className="mt-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <p className="text-[10px] text-amber-300 leading-snug">
            <span className="font-bold">Low SPR alert:</span> With SPR {spr.toFixed(1)}, ranges polarize
            heavily — drawing hands lose value and strong made hands should build the pot aggressively.
          </p>
        </div>
      )}

      {/* ── Solver Frequency Breakdown ──────────────────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-2">
          <span>GTO SOLVER FREQUENCIES [{strategy.handKey}]</span>
          <span>Optimal: {grading.optimalActionLabel}</span>
        </div>

        <div className="space-y-1.5">
          {displayFreqs.map((item, idx) => {
            const isUserChoice = item.action === grading.userMatchedAction;
            return (
              <div
                key={idx}
                className={`flex items-center justify-between text-xs rounded-lg px-1.5 py-0.5 transition-all ${
                  isUserChoice ? 'bg-slate-800/60 ring-1 ring-cyan-500/40' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-300 font-medium truncate">{item.label}</span>
                  {isUserChoice && (
                    <span className="text-[9px] font-extrabold text-cyan-400 whitespace-nowrap flex-shrink-0">
                      ◀ YOUR CHOICE
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-20 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor(item.action)}`}
                      style={{ width: `${item.frequency * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-slate-200 min-w-[32px] text-right">
                    {(item.frequency * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
