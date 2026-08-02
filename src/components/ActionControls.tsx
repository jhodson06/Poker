import React, { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { TableState } from '../engine/stateMachine';

interface ActionControlsProps {
  tableState: TableState;
  difficultyMode: 'simple' | 'grouped' | 'standard';
  isTransitioning?: boolean;
  onAction: (actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount?: number) => void;
  onNextHand: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  tableState,
  difficultyMode,
  isTransitioning = false,
  onAction,
  onNextHand
}) => {
  const heroSeat = tableState.players.findIndex(p => p.isHuman);
  const hero = tableState.players[heroSeat];
  const isHeroTurn = tableState.activeSeat === heroSeat && tableState.street !== 'showdown' && hero && !hero.isFolded;

  const currentHighBet = tableState.currentHighBet;
  const heroCurrentBet = hero?.currentBet || 0;
  const callAmount = currentHighBet - heroCurrentBet;
  const pot = tableState.pot;

  const [betSizeInput, setBetSizeInput] = useState<number>(Math.max(tableState.bigBlind, Math.floor(pot * 0.5)));

  if (isTransitioning) {
    return (
      <div className="w-full py-4 text-center">
        <div className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl glass-panel text-sm text-cyan-300 font-extrabold border border-cyan-500/40 shadow-xl shadow-cyan-500/10">
          <Sparkles className="w-5 h-5 text-cyan-400 animate-spin" />
          <span className="uppercase tracking-wide font-heading">
            {tableState.street === 'flop'
              ? 'DEALING FLOP...'
              : tableState.street === 'turn'
              ? 'DEALING TURN CARD...'
              : tableState.street === 'river'
              ? 'DEALING RIVER CARD...'
              : 'NEXT STREET...'}
          </span>
        </div>
      </div>
    );
  }

  if (tableState.street === 'showdown' || (tableState.winners && tableState.winners.length > 0)) {
    return (
      <div className="w-full flex justify-center py-3">
        <button
          onClick={onNextHand}
          className="btn-poker-bet flex items-center gap-2 px-10 py-4 rounded-2xl font-black text-base tracking-wide border-2 shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <span>DEAL NEXT HAND</span>
          <ArrowRight className="w-5 h-5 stroke-[3]" />
        </button>
      </div>
    );
  }

  if (!isHeroTurn) {
    const activePlayer = tableState.players[tableState.activeSeat];
    return (
      <div className="w-full py-3 text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl glass-panel text-xs text-slate-300 font-semibold border border-slate-800 shadow-md">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span>Waiting for {activePlayer?.name || 'opponents'} to act...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 glass-panel rounded-2xl border border-slate-700 shadow-2xl flex flex-col gap-3">
      {/* Turn Header */}
      <div className="flex items-center justify-between text-xs font-bold px-1">
        <span className="text-emerald-400 flex items-center gap-1.5 font-mono">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          YOUR TURN TO ACT [{hero.position}] | STREET: {tableState.street.toUpperCase()}
        </span>
        <span className="text-slate-300 font-mono uppercase bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
          {difficultyMode} MODE
        </span>
      </div>

      {/* Mode 1: Simple Mode */}
      {difficultyMode === 'simple' && (
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onAction('fold')}
            className="btn-poker-fold py-4 rounded-xl font-black text-sm tracking-wider"
          >
            FOLD
          </button>
          <button
            onClick={() => onAction(callAmount > 0 ? 'call' : 'check')}
            className="btn-poker-call py-4 rounded-xl font-black text-sm tracking-wider"
          >
            {callAmount > 0 ? `CALL ${callAmount} BB` : 'CHECK'}
          </button>
          <button
            onClick={() => onAction('bet', Math.max(tableState.bigBlind, Math.floor(pot * 0.5)))}
            className="btn-poker-bet py-4 rounded-xl font-black text-sm tracking-wider"
          >
            BET / RAISE
          </button>
        </div>
      )}

      {/* Mode 2: Grouped Mode */}
      {difficultyMode === 'grouped' && (
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onAction('fold')}
            className="btn-poker-fold py-4 rounded-xl font-black text-sm tracking-wider"
          >
            FOLD
          </button>
          <button
            onClick={() => onAction(callAmount > 0 ? 'call' : 'check')}
            className="btn-poker-call py-4 rounded-xl font-black text-sm tracking-wider"
          >
            {callAmount > 0 ? `CHECK / CALL ${callAmount} BB` : 'CHECK / CALL'}
          </button>
          <button
            onClick={() => onAction(currentHighBet > 0 ? 'raise' : 'bet', Math.max(tableState.bigBlind, Math.floor(pot * 0.75)))}
            className="btn-poker-bet py-4 rounded-xl font-black text-sm tracking-wider"
          >
            BET / RAISE
          </button>
        </div>
      )}

      {/* Mode 3: Standard Mode (Exact Bet Sizing) */}
      {difficultyMode === 'standard' && (
        <div className="flex flex-col gap-3">
          {/* Pot Percentage Buttons & Slider */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: '33% Pot', val: Math.floor(pot * 0.33) },
              { label: '50% Pot', val: Math.floor(pot * 0.5) },
              { label: '75% Pot', val: Math.floor(pot * 0.75) },
              { label: '100% Pot', val: pot },
              { label: 'ALL-IN', val: hero.chips }
            ].map(b => {
              const targetVal = Math.max(tableState.bigBlind, b.val);
              const isActive = betSizeInput === targetVal;
              return (
                <button
                  key={b.label}
                  onClick={() => setBetSizeInput(targetVal)}
                  className={`btn-poker-preset px-3.5 py-1.5 rounded-lg text-xs font-bold ${
                    isActive ? 'btn-poker-preset-active' : ''
                  }`}
                >
                  {b.label}
                </button>
              );
            })}

            {/* Bet Slider */}
            <div className="flex-1 min-w-[160px] flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <input
                type="range"
                min={tableState.bigBlind}
                max={hero.chips}
                step={1}
                value={betSizeInput}
                onChange={e => setBetSizeInput(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <span className="text-xs font-mono font-black text-emerald-400 min-w-[55px] text-right">
                {betSizeInput} BB
              </span>
            </div>
          </div>

          {/* Decision Buttons */}
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => onAction('fold')}
              className="btn-poker-fold py-4 rounded-xl font-black text-sm tracking-wider"
            >
              FOLD
            </button>

            <button
              onClick={() => onAction('check')}
              disabled={callAmount > 0}
              className={`py-4 rounded-xl font-black text-sm tracking-wider ${
                callAmount > 0
                  ? 'bg-slate-900/40 text-slate-600 border border-slate-800/40 cursor-not-allowed'
                  : 'btn-poker-check'
              }`}
            >
              CHECK
            </button>

            <button
              onClick={() => onAction('call')}
              disabled={callAmount === 0}
              className={`py-4 rounded-xl font-black text-sm tracking-wider ${
                callAmount === 0
                  ? 'bg-slate-900/40 text-slate-600 border border-slate-800/40 cursor-not-allowed'
                  : 'btn-poker-call'
              }`}
            >
              CALL {callAmount} BB
            </button>

            <button
              onClick={() => onAction(currentHighBet > 0 ? 'raise' : 'bet', betSizeInput)}
              className="btn-poker-bet py-4 rounded-xl font-black text-sm tracking-wider"
            >
              {currentHighBet > 0 ? `RAISE ${betSizeInput} BB` : `BET ${betSizeInput} BB`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
