import React, { useState } from 'react';
import { X, Eye, TrendingUp, Sparkles, Check } from 'lucide-react';

interface SandboxModalProps {
  revealAllCards: boolean;
  showEquityOverlays: boolean;
  forcedHeroCards: [string, string] | null;
  onToggleRevealCards: (val: boolean) => void;
  onToggleEquityOverlays: (val: boolean) => void;
  onSetForcedHeroCards: (cards: [string, string] | null) => void;
  onClose: () => void;
}

const ALL_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_ICONS: Record<string, { symbol: string; color: string }> = {
  s: { symbol: '♠', color: 'text-slate-200' },
  h: { symbol: '♥', color: 'text-red-400' },
  d: { symbol: '♦', color: 'text-blue-400' },
  c: { symbol: '♣', color: 'text-emerald-400' }
};

export const SandboxModal: React.FC<SandboxModalProps> = ({
  revealAllCards,
  showEquityOverlays,
  forcedHeroCards,
  onToggleRevealCards,
  onToggleEquityOverlays,
  onSetForcedHeroCards,
  onClose
}) => {
  const [c1Rank, setC1Rank] = useState<string>(forcedHeroCards ? forcedHeroCards[0][0] : 'A');
  const [c1Suit, setC1Suit] = useState<string>(forcedHeroCards ? forcedHeroCards[0][1] : 's');
  const [c2Rank, setC2Rank] = useState<string>(forcedHeroCards ? forcedHeroCards[1][0] : 'K');
  const [c2Suit, setC2Suit] = useState<string>(forcedHeroCards ? forcedHeroCards[1][1] : 's');

  const card1Str = `${c1Rank}${c1Suit}`;
  const card2Str = `${c2Rank}${c2Suit}`;
  const isDuplicate = card1Str === card2Str;

  const handleApplyForcedCards = () => {
    if (isDuplicate) return;
    onSetForcedHeroCards([card1Str, card2Str]);
  };

  const handleClearForcedCards = () => {
    onSetForcedHeroCards(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-purple-500/30 shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white font-heading">
                  SANDBOX & CHEAT MENU
                </h2>
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-500/40 uppercase tracking-wide">
                  Practice Mode
                </span>
              </div>
              <p className="text-xs text-slate-400">
                God Mode, Hole Card Peeking & Custom Hand Force Dealer
              </p>
            </div>
          </div>

          <button onClick={onClose} className="btn-poker-nav p-2 rounded-xl text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cheat Tool 1: Reveal Opponent Hole Cards (God Mode) */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Eye className="w-4 h-4 text-purple-400" />
              <span>God Mode (Reveal Opponent Cards)</span>
            </div>
            <button
              onClick={() => onToggleRevealCards(!revealAllCards)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                revealAllCards
                  ? 'bg-purple-600 text-white border border-purple-400 shadow-lg shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {revealAllCards ? 'REVEALED 👁️' : 'OFF'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Turn face-up all opponent cards at the table in real-time to study AI decision lines.
          </p>
        </div>

        {/* Cheat Tool 2: Live Equity Overlays */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Live Equity Overlays</span>
            </div>
            <button
              onClick={() => onToggleEquityOverlays(!showEquityOverlays)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                showEquityOverlays
                  ? 'bg-emerald-600 text-white border border-emerald-400 shadow-lg shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {showEquityOverlays ? 'SHOWING 📈' : 'OFF'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Display live preflop and postflop win percentage badges next to each active player seat.
          </p>
        </div>

        {/* Cheat Tool 3: Custom Hand Force Dealer */}
        <div className="flex flex-col gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Force Deal Specific Cards (Next Hand)</span>
            </div>
            {forcedHeroCards && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                Active: {forcedHeroCards[0]} {forcedHeroCards[1]}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Force deal exact hole cards (e.g. Pocket Aces or 7-2) for Hero on the next hand.
          </p>

          <div className="grid grid-cols-2 gap-4 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            {/* Card 1 Picker */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-300">Card #1:</span>
              <div className="flex items-center gap-2">
                <select
                  value={c1Rank}
                  onChange={e => setC1Rank(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-black rounded-lg px-2.5 py-2 flex-1"
                >
                  {ALL_RANKS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  value={c1Suit}
                  onChange={e => setC1Suit(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-black rounded-lg px-2.5 py-2 flex-1"
                >
                  {Object.keys(SUIT_ICONS).map(s => (
                    <option key={s} value={s}>{SUIT_ICONS[s].symbol} ({s.toUpperCase()})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Card 2 Picker */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-300">Card #2:</span>
              <div className="flex items-center gap-2">
                <select
                  value={c2Rank}
                  onChange={e => setC2Rank(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-black rounded-lg px-2.5 py-2 flex-1"
                >
                  {ALL_RANKS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  value={c2Suit}
                  onChange={e => setC2Suit(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-black rounded-lg px-2.5 py-2 flex-1"
                >
                  {Object.keys(SUIT_ICONS).map(s => (
                    <option key={s} value={s}>{SUIT_ICONS[s].symbol} ({s.toUpperCase()})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {isDuplicate && (
            <span className="text-xs text-red-400 font-medium text-center">
              ⚠️ Hole cards must be two different cards!
            </span>
          )}

          <div className="flex items-center gap-2 mt-1">
            <button
              disabled={isDuplicate}
              onClick={handleApplyForcedCards}
              className="flex-1 btn-poker-bet py-2.5 rounded-xl font-extrabold text-xs tracking-wider shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              FORCE NEXT HAND ({card1Str} {card2Str})
            </button>

            {forcedHeroCards && (
              <button
                onClick={handleClearForcedCards}
                className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs font-bold transition-all border border-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Apply / Close Button */}
        <button
          onClick={onClose}
          className="btn-poker-nav w-full py-3 rounded-xl font-black text-xs tracking-wider border text-slate-200 mt-1 transition-all"
        >
          CLOSE CHEAT MENU
        </button>
      </div>
    </div>
  );
};
