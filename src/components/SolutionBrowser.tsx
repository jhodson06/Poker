import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { RANKS, createCard } from '../engine/card';
import { getGtoStrategyForState, GtoNodeStrategy, getCanonicalHandKey } from '../gto/strategyDatabase';
import { TableState, PlayerPosition, BettingStreet } from '../engine/stateMachine';

interface SolutionBrowserProps {
  tableState?: TableState;
  onClose: () => void;
}

export const SolutionBrowser: React.FC<SolutionBrowserProps> = ({ tableState, onClose }) => {
  // Derive default hero position, street, and hand from active tableState
  const hero = tableState?.players.find(p => p.isHuman);
  const initialPosition = (hero?.position || 'BTN') as PlayerPosition;
  const initialStreet = (tableState?.street === 'showdown' ? 'flop' : (tableState?.street || 'preflop')) as BettingStreet;

  const initialHandKey = hero && hero.holeCards && hero.holeCards.length >= 2
    ? getCanonicalHandKey(hero.holeCards[0], hero.holeCards[1])
    : 'AKs';

  const [selectedHand, setSelectedHand] = useState<string>(initialHandKey);
  const [position, setPosition] = useState<PlayerPosition>(initialPosition);
  const [street, setStreet] = useState<BettingStreet>(initialStreet);

  // Build 13x13 grid labels
  const gridRanks = [...RANKS].reverse(); // A, K, Q, J, T, 9, 8, 7, 6, 5, 4, 3, 2

  const getHandKeyAt = (rowIdx: number, colIdx: number): string => {
    const r1 = gridRanks[rowIdx];
    const r2 = gridRanks[colIdx];
    if (rowIdx === colIdx) return `${r1}${r2}`; // Pair
    if (rowIdx < colIdx) return `${r1}${r2}s`; // Suited (upper right)
    return `${r2}${r1}o`; // Offsuit (lower left)
  };

  const getStrategyForCell = (key: string): GtoNodeStrategy => {
    const r1Char = key[0];
    const r2Char = key[1];
    const isSuited = key.endsWith('s');
    const c1 = createCard(r1Char as any, 's');
    const c2 = createCard(r2Char as any, isSuited ? 's' : 'h');
    const community = tableState?.communityCards || [];
    const highBet = tableState?.currentHighBet || 2;
    const pot = tableState?.pot || 5;
    const bb = tableState?.bigBlind || 2;
    return getGtoStrategyForState(c1, c2, position, street, highBet, pot, bb, community);
  };

  const selectedStrategy = getStrategyForCell(selectedHand);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-5xl glass-panel rounded-2xl border border-slate-700 shadow-2xl p-6 flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white font-heading">
                13x13 GTO SOLUTION MATRIX
              </h2>
              <p className="text-xs text-slate-400">
                Interactive Range Browser & Nash Equilibrium Strategy Heatmap
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Position & Street Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">POSITION:</span>
            {(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] as const).map(pos => (
              <button
                key={pos}
                onClick={() => setPosition(pos)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 ${
                  position === pos
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">STREET:</span>
            {(['preflop', 'flop', 'turn', 'river'] as const).map(str => (
              <button
                key={str}
                onClick={() => setStreet(str)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95 ${
                  street === str
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {str}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Grid & Strategy Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 13x13 Range Matrix (2 cols) */}
          <div className="md:col-span-2 bg-slate-900/90 p-4 rounded-xl border border-slate-800">
            <div className="grid grid-cols-13 gap-1">
              {gridRanks.map((r1, rowIdx) =>
                gridRanks.map((r2, colIdx) => {
                  const key = getHandKeyAt(rowIdx, colIdx);
                  const strat = getStrategyForCell(key);
                  const isSelected = selectedHand === key;

                  const raiseFreq = strat.frequencies.find(f => f.action === 'raise' || f.action === 'bet_75')?.frequency || 0;
                  const callFreq = strat.frequencies.find(f => f.action === 'call' || f.action === 'bet_33')?.frequency || 0;
                  const checkFreq = strat.frequencies.find(f => f.action === 'check')?.frequency || 0;

                  let cellBg = 'bg-slate-700/50';
                  if (raiseFreq > 0.5) cellBg = 'bg-rose-600/80 text-white';
                  else if (callFreq > 0.4) cellBg = 'bg-emerald-600/80 text-white';
                  else if (checkFreq > 0.5) cellBg = 'bg-blue-600/80 text-white';
                  else cellBg = 'bg-slate-800/80 text-slate-400';

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedHand(key)}
                      className={`aspect-square flex items-center justify-center text-[10px] sm:text-xs font-mono font-extrabold rounded transition-all hover:scale-110 ${cellBg} ${
                        isSelected ? 'ring-2 ring-amber-400 scale-105 z-10' : ''
                      }`}
                    >
                      {key}
                    </button>
                  );
                })
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 text-[11px] font-semibold text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-600" /> Raise / Bet 75%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-600" /> Call / Bet 33%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600" /> Check
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800" /> Fold
              </span>
            </div>
          </div>

          {/* Selected Hand Strategy Details (1 col) */}
          <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <span className="text-2xl font-black font-mono text-amber-400">{selectedHand}</span>
                <span className="text-xs font-bold text-slate-400 uppercase">
                  {position} | {street}
                </span>
              </div>

              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Action Frequencies & EV
              </h4>

              <div className="space-y-3">
                {selectedStrategy.frequencies.map((f, i) => (
                  <div key={i} className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-white">{f.label}</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {(f.frequency * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mb-1">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${f.frequency * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Expected Value: {f.ev > 0 ? `+${f.ev} BB` : `${f.ev} BB`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <span className="text-xs text-emerald-400 font-bold font-mono">
                Optimal Action: {selectedStrategy.optimalAction.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
