import React from 'react';
import { X, Sliders, Users, Shield, Layers, Coins, Target } from 'lucide-react';
import { StackResetMode } from '../engine/stateMachine';

interface SettingsModalProps {
  playerCount: number;
  difficultyMode: 'simple' | 'standard';
  startingStackBB: number;
  stackResetMode: StackResetMode;
  isStrictStrategy: boolean;
  onChangePlayerCount: (count: number) => void;
  onChangeDifficultyMode: (mode: 'simple' | 'standard') => void;
  onChangeStackBB: (stack: number) => void;
  onChangeStackResetMode: (mode: StackResetMode) => void;
  onChangeStrictStrategy: (enabled: boolean) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  playerCount,
  difficultyMode,
  startingStackBB,
  stackResetMode,
  isStrictStrategy,
  onChangePlayerCount,
  onChangeDifficultyMode,
  onChangeStackBB,
  onChangeStackResetMode,
  onChangeStrictStrategy,
  onClose
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-slate-700 shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white font-heading">
                TRAINER SETTINGS
              </h2>
              <p className="text-xs text-slate-400">
                Customize Table Seats, Action Spaces & Stack Rules
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-poker-nav p-2 rounded-xl text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Setting 1: Player Count (2 to 6) */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Player Count (Table Size)</span>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {playerCount === 2 ? 'Heads-Up (2)' : `${playerCount} Players`}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Select table seats from 2 (Heads-Up) to 6 (6-Max ring game).
          </p>
          <div className="flex items-center gap-2 mt-1">
            {[2, 3, 4, 5, 6].map(num => (
              <button
                key={num}
                onClick={() => onChangePlayerCount(num)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
                  playerCount === num ? 'btn-setting-option-active' : 'btn-setting-option'
                }`}
              >
                {num === 2 ? '2 (HU)' : `${num}-Max`}
              </button>
            ))}
          </div>
        </div>

        {/* Setting 2: Stack Reset Mode (Persistent vs Reset Each Hand) */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Coins className="w-4 h-4 text-emerald-400" />
              <span>Stack Persistence Mode</span>
            </div>
            <span className="text-xs font-mono font-bold uppercase px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {stackResetMode === 'persistent' ? 'Persistent' : 'Reset Each Hand'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Choose whether player chip stacks carry over hand-to-hand like a real cash game, or reset before every hand.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-1">
            {[
              { mode: 'persistent', title: 'PERSISTENT (CASH GAME)', desc: 'Chips carry over hand-to-hand' },
              { mode: 'reset_each_hand', title: 'RESET EACH HAND', desc: 'Stacks reset to target BB every hand' }
            ].map(s => (
              <button
                key={s.mode}
                onClick={() => onChangeStackResetMode(s.mode as StackResetMode)}
                className={`p-3 rounded-xl flex flex-col items-center gap-1 text-center transition-all ${
                  stackResetMode === s.mode ? 'btn-setting-option-active' : 'btn-setting-option'
                }`}
              >
                <span className="text-xs font-black">{s.title}</span>
                <span className="text-[10px] opacity-80 font-medium">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Setting 3: Difficulty Mode */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Difficulty Mode (Action Space)</span>
            </div>
            <span className="text-xs font-mono font-bold uppercase px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              {difficultyMode}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            {[
              { mode: 'simple', title: 'SIMPLE MODE', desc: 'Fold / Call / Bet-Raise Line Focus' },
              { mode: 'standard', title: 'STANDARD GTO', desc: 'Exact Sizing (33%, 75%, 2.5x, All-In)' }
            ].map(m => (
              <button
                key={m.mode}
                onClick={() => onChangeDifficultyMode(m.mode as any)}
                className={`p-3 rounded-xl flex flex-col items-center gap-1 text-center transition-all ${
                  difficultyMode === m.mode ? 'btn-setting-option-active' : 'btn-setting-option'
                }`}
              >
                <span className="text-xs font-black">{m.title}</span>
                <span className="text-[10px] opacity-80 font-medium">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Setting 4: Strict Pure Strategy Mode */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Target className="w-4 h-4 text-rose-400" />
              <span>Strict Pure Strategy Mode</span>
            </div>
            <span
              className={`text-xs font-mono font-bold uppercase px-2.5 py-1 rounded-md border ${
                isStrictStrategy
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isStrictStrategy ? 'STRICT PURE 🎯' : 'STANDARD MIX'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            When enabled, only the single best optimal action (or dual ~40% split options) is graded as Correct. Minor mixed options are penalized.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-1">
            <button
              onClick={() => onChangeStrictStrategy(false)}
              className={`p-3 rounded-xl flex flex-col items-center gap-1 text-center transition-all ${
                !isStrictStrategy ? 'btn-setting-option-active' : 'btn-setting-option'
              }`}
            >
              <span className="text-xs font-black">STANDARD MIX</span>
              <span className="text-[10px] opacity-80 font-medium">Allows GTO Mixed Lines (&gt;5%)</span>
            </button>
            <button
              onClick={() => onChangeStrictStrategy(true)}
              className={`p-3 rounded-xl flex flex-col items-center gap-1 text-center transition-all ${
                isStrictStrategy
                  ? 'bg-rose-600 text-white font-extrabold shadow-lg shadow-rose-600/30 border border-rose-400'
                  : 'btn-setting-option'
              }`}
            >
              <span className="text-xs font-black">STRICT PURE 🎯</span>
              <span className="text-[10px] opacity-80 font-medium">Single Best Action Only</span>
            </button>
          </div>
        </div>

        {/* Setting 4: Starting Stack Depth */}
        <div className="flex flex-col gap-2.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Starting Stack Depth</span>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {startingStackBB} BB
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {[50, 100, 200].map(stack => (
              <button
                key={stack}
                onClick={() => onChangeStackBB(stack)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
                  startingStackBB === stack ? 'btn-setting-option-active' : 'btn-setting-option'
                }`}
              >
                {stack} BB
              </button>
            ))}
          </div>
        </div>

        {/* Footer Apply Button */}
        <button
          onClick={onClose}
          className="btn-poker-bet w-full py-3.5 rounded-xl font-black text-sm tracking-wider shadow-xl border-2 mt-1 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          APPLY & START TRAINING
        </button>
      </div>
    </div>
  );
};
