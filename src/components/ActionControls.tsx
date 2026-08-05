import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { TableState } from '../engine/stateMachine';
import { detectBoardTexture } from '../engine/betAbstraction';

interface ActionControlsProps {
  tableState: TableState;
  difficultyMode: 'simple' | 'grouped' | 'standard';
  isTransitioning?: boolean;
  onAction: (actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount?: number) => void;
  onNextHand: () => void;
}

// Format a multiplier cleanly: 2.0 → "2", 2.5 → "2.5"
function fmtMult(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
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

  const bb = tableState.bigBlind;
  const currentHighBet = tableState.currentHighBet;
  const heroCurrentBet = hero?.currentBet || 0;
  const callAmount = Math.max(0, currentHighBet - heroCurrentBet);
  const pot = tableState.pot;
  const isPreflop = tableState.street === 'preflop';
  const isTurnOrRiver = tableState.street === 'turn' || tableState.street === 'river';
  const position = hero?.position ?? 'BTN';
  const raiseCount = tableState.raiseCount ?? 0;

  // Preflop: hero is "opening" if no raise above the BB (currentHighBet === BB)
  // "Facing a raise" = someone raised above BB
  const isFacingPreflopRaise = isPreflop && currentHighBet > bb;
  // Fallback: If currentHighBet is very large (>= 12 BB), it's at least a 4-bet spot even if raiseCount tracking lagged
  const is4BetSpot = isFacingPreflopRaise && (raiseCount >= 2 || currentHighBet >= bb * 12);

  // Position classification per PDF
  const isLatePos = position === 'BTN' || position === 'CO' || position === 'SB';
  const isIpPos = position === 'BTN' || position === 'CO';

  // Min legal raise total = 2x the last bet/raise (or 2x BB for opens)
  const minRaise = Math.max(
    bb * 2,
    currentHighBet > 0 ? currentHighBet * 2 : bb * 2
  );
  const maxRaise = hero?.chips || 200;
  const clamp = (v: number) => Math.max(minRaise, Math.min(maxRaise, Math.round(v)));

  // Board texture detection for postflop sizing
  const boardTexture = isPreflop ? 'dry' : detectBoardTexture(tableState.communityCards);
  const isWetBoard = boardTexture === 'wet' || boardTexture === 'very_wet';

  // Compute default standard-mode bet size
  const computeDefault = () => {
    if (isPreflop) {
      if (is4BetSpot) {
        // 4-bet default: IP 2.3x, OOP 2.8x
        return clamp(Math.round(currentHighBet * (isIpPos ? 2.3 : 2.8)));
      }
      if (isFacingPreflopRaise) {
        // 3-bet default: IP 3.0x, OOP 4.0x
        return clamp(Math.round(currentHighBet * (isIpPos ? 3.0 : 4.0)));
      }
      // Open default: LP 3.0x, EP/MP 2.5x
      return clamp(Math.round(bb * (isLatePos ? 3.0 : 2.5)));
    }
    return clamp(Math.max(bb, Math.round(pot * 0.5))); // 50% pot postflop
  };

  const [betSizeInput, setBetSizeInput] = useState<number>(computeDefault);

  // Reset when street or current-high-bet changes
  useEffect(() => {
    setBetSizeInput(computeDefault());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableState.street, currentHighBet]);

  // HELPER: Convert raw chips to BB for display
  const toBB = (chips: number) => (chips / bb).toFixed(1).replace('.0', '');

  // ── Slider label ──────────────────────────────────────────────────────────
  const sliderLabel = () => {
    if (isPreflop) {
      const base = isFacingPreflopRaise ? currentHighBet : bb;
      const mult = base > 0 ? betSizeInput / base : 0;
      const suffix = isFacingPreflopRaise ? 'x raise' : 'x BB';
      return `${toBB(betSizeInput)} BB  (${fmtMult(mult)}${suffix})`;
    }
    const pct = pot > 0 ? Math.round((betSizeInput / pot) * 100) : 0;
    return `${toBB(betSizeInput)} BB  (${pct}% Pot)`;
  };

  // ── Simple-mode raise sizing ──────────────────────────────────────────────
  // Preflop:
  //   Open — LP (BTN/CO/SB): 3.0x BB | EP/MP (UTG/MP): 2.5x BB
  //   3-Bet — IP (BTN/CO): 3.0x raise | OOP (SB/BB/UTG/MP): 4.0x raise
  //   4-Bet — IP: 2.3x raise | OOP: 2.8x raise
  // Postflop:
  //   Dry board: 33% pot | Wet board: 75% pot | Facing a bet: 2.5x raise
  const simpleAmount = (() => {
    if (isPreflop) {
      if (is4BetSpot) {
        return clamp(Math.round(currentHighBet * (isIpPos ? 2.3 : 2.8)));
      }
      if (isFacingPreflopRaise) {
        return clamp(Math.round(currentHighBet * (isIpPos ? 3.0 : 4.0)));
      }
      return clamp(Math.round(bb * (isLatePos ? 3.0 : 2.5)));
    }
    // Postflop
    if (currentHighBet > 0) {
      return clamp(Math.round(currentHighBet * 2.5));
    }
    // Board-texture-aware bet sizing per PDF / research AI validation:
    //   Dry boards: 33% pot (small frequent bet, range advantage exploitation)
    //   Wet/dynamic boards: 67% pot (polarized sizing, matches solver preference)
    return Math.max(bb, Math.round(pot * (isWetBoard ? 0.67 : 0.33)));
  })();

  const simpleLabel = (() => {
    if (isPreflop) {
      if (is4BetSpot) {
        return `4-BET  (${toBB(simpleAmount)} BB)`;
      }
      if (isFacingPreflopRaise) {
        return `3-BET  (${toBB(simpleAmount)} BB)`;
      }
      return `RAISE  (${toBB(simpleAmount)} BB)`;
    }
    if (currentHighBet > 0) {
      return `RAISE  (${toBB(simpleAmount)} BB)`;
    }
    const pct = pot > 0 ? Math.round((simpleAmount / pot) * 100) : (isWetBoard ? 67 : 33);
    // Label includes board texture hint
    const textureHint = boardTexture === 'very_wet' ? ' [VERY WET]' : boardTexture === 'wet' ? ' [WET]' : ' [DRY]';
    return `BET ${pct}% POT${textureHint}  (${toBB(simpleAmount)} BB)`;
  })();

  const simpleActionType = currentHighBet > 0 ? 'raise' : 'bet';

  // ── Transient states ──────────────────────────────────────────────────────
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

  // ── Preflop quick-bet buttons for Standard Mode ───────────────────────────
  // Open buttons: EP/MP use 2x/2.5x, LP use 2.5x/3x/3.5x
  const preflopOpenButtons = isLatePos
    ? [2.5, 3.0, 3.5, 4.0].map(mult => ({
        label: `${fmtMult(mult)}x BB`,
        val: clamp(Math.round(bb * mult)),
      }))
    : [2.0, 2.5, 3.0, 4.0].map(mult => ({
        label: `${fmtMult(mult)}x BB`,
        val: clamp(Math.round(bb * mult)),
      }));

  // 3-bet buttons: IP use 3x/3.5x, OOP use 3.5x/4x/4.5x
  const preflopRaiseButtons3Bet = isIpPos
    ? [2.5, 3.0, 3.5, 4.0].map(mult => ({
        label: `${fmtMult(mult)}x`,
        val: clamp(Math.round(currentHighBet * mult)),
      }))
    : [3.5, 4.0, 4.5, 5.0].map(mult => ({
        label: `${fmtMult(mult)}x`,
        val: clamp(Math.round(currentHighBet * mult)),
      }));

  // 4-bet buttons: IP use 2.2x/2.5x, OOP use 2.7x/3.0x
  const preflopRaiseButtons4Bet = isIpPos
    ? [2.0, 2.2, 2.5, 2.8].map(mult => ({
        label: `${fmtMult(mult)}x`,
        val: clamp(Math.round(currentHighBet * mult)),
      }))
    : [2.5, 2.7, 3.0, 3.3].map(mult => ({
        label: `${fmtMult(mult)}x`,
        val: clamp(Math.round(currentHighBet * mult)),
      }));

  // ── Postflop quick-bet buttons for Standard Mode ──────────────────────────
  // On turn/river, add 150% Pot (overbet) option per PDF spec
  const postflopBetButtons = [
    { label: '25% Pot', pct: 0.25 },
    { label: '33% Pot', pct: 0.33 },
    { label: '50% Pot', pct: 0.50 },
    { label: '75% Pot', pct: 0.75 },
    { label: '100% Pot', pct: 1.00 },
    { label: '133% Pot', pct: 1.33 },
    ...(isTurnOrRiver ? [{ label: '150% Pot', pct: 1.50 }] : []),
  ].map(b => ({
    label: b.label,
    val: clamp(Math.max(bb, Math.round(pot * b.pct))),
  }));

  const preflopRaiseButtons = is4BetSpot ? preflopRaiseButtons4Bet : preflopRaiseButtons3Bet;

  const quickBtns = isPreflop
    ? isFacingPreflopRaise ? preflopRaiseButtons : preflopOpenButtons
    : postflopBetButtons;

  // Context label for Standard Mode header
  const getContextLabel = () => {
    if (isPreflop) {
      if (is4BetSpot) {
        return `FACING ${toBB(currentHighBet)} BB 3-BET — choose 4-bet size (${isIpPos ? 'IP: 2.2–2.5x' : 'OOP: 2.7–3.0x'}):`;
      }
      if (isFacingPreflopRaise) {
        return `FACING ${toBB(currentHighBet)} BB RAISE — choose 3-bet size (${isIpPos ? 'IP: 3x' : 'OOP: 4x'}):`;
      }
      return `PREFLOP OPEN [${position}] — choose raise size (${isLatePos ? 'LP: 2.5–3.5x BB' : 'EP/MP: 2–3x BB'}):`;
    }
    const textureLabel = boardTexture === 'very_wet' ? ' VERY WET' : boardTexture === 'wet' ? ' WET' : ' DRY';
    return `${tableState.street.toUpperCase()} [${textureLabel} BOARD] — choose bet size (pot %):`;
  };

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* ── Simple Mode ─────────────────────────────────────────────────── */}
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
            {callAmount > 0 ? `CALL ${toBB(callAmount)} BB` : 'CHECK'}
          </button>
          <button
            onClick={() => onAction(simpleActionType, simpleAmount)}
            className="btn-poker-bet py-4 rounded-xl font-black text-xs tracking-wider"
          >
            {simpleLabel}
          </button>
        </div>
      )}

      {/* ── Standard Mode ───────────────────────────────────────────────── */}
      {difficultyMode === 'standard' && (
        <div className="flex flex-col gap-3">

          {/* Context label */}
          <div className="text-[10px] text-slate-500 font-mono px-1">
            {getContextLabel()}
          </div>

          {/* Quick-select sizing buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {quickBtns.map(b => {
              const isActive = betSizeInput === b.val;
              return (
                <button
                  key={b.label}
                  onClick={() => setBetSizeInput(b.val)}
                  className={`btn-poker-preset px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive ? 'btn-poker-preset-active' : ''
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
            <button
              onClick={() => setBetSizeInput(maxRaise)}
              className={`btn-poker-preset px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                betSizeInput === maxRaise ? 'btn-poker-preset-active' : ''
              }`}
            >
              ALL-IN ({maxRaise} BB)
            </button>
          </div>

          {/* Slider */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
            <input
              type="range"
              min={minRaise}
              max={maxRaise}
              step={isPreflop ? 0.5 : 1}
              value={betSizeInput}
              onChange={e => setBetSizeInput(Number(e.target.value))}
              className="flex-1 accent-emerald-400 cursor-pointer"
            />
            <span className="text-xs font-mono font-black text-emerald-400 min-w-[160px] text-right whitespace-nowrap">
              {sliderLabel()}
            </span>
          </div>

          {/* Action buttons */}
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
              CALL {toBB(callAmount)} BB
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
