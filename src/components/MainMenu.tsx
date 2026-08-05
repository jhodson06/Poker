import React from 'react';
import { Play, Dumbbell, Spade, BookOpen, Calculator } from 'lucide-react';

interface MainMenuProps {
  onStartFullGame: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartFullGame }) => {
  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <div className="z-10 mb-12 text-center animate-fade-in-up">
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 drop-shadow-xl tracking-tight mb-4">
          POKER TRAINER
        </h1>
        <p className="text-lg md:text-xl text-slate-400 font-medium tracking-wide max-w-2xl mx-auto">
          Master Game Theory Optimal (GTO) Strategy for No-Limit Texas Hold'em
        </p>
      </div>

      {/* Menu Grid */}
      <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-5xl animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        
        {/* Full Game Button */}
        <button
          onClick={onStartFullGame}
          className="group relative col-span-1 md:col-span-2 overflow-hidden rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300 shadow-2xl hover:shadow-emerald-500/20 p-8 flex items-center gap-6"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="bg-emerald-500/20 p-4 rounded-2xl border border-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
            <Play className="w-10 h-10 text-emerald-400 fill-emerald-400/20" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-3xl font-black text-white mb-2 group-hover:text-emerald-400 transition-colors">Practice Mode: Full Game</h2>
            <p className="text-slate-400 font-medium text-sm md:text-base">Jump directly into a 6-Max sandbox environment. Play complete hands from Preflop to River with real-time GTO evaluation and live EV tracking.</p>
          </div>
        </button>

        {/* Placeholder Buttons */}
        <button
          disabled
          className="group relative overflow-hidden rounded-3xl bg-slate-900/40 backdrop-blur-md border border-slate-800/50 p-6 flex flex-col gap-4 text-left opacity-60 hover:opacity-100 transition-all cursor-not-allowed"
        >
          <div className="bg-rose-500/10 w-max p-3 rounded-xl border border-rose-500/20">
            <Spade className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-200 mb-1 flex items-center justify-between">
              Preflop Exclusive
              <span className="text-[10px] uppercase font-black tracking-wider bg-slate-800 text-slate-400 px-2 py-1 rounded-md">Coming Soon</span>
            </h3>
            <p className="text-slate-500 text-sm">Master RFI, 3-betting, and 4-betting charts across all positions without postflop complexity.</p>
          </div>
        </button>

        <button
          disabled
          className="group relative overflow-hidden rounded-3xl bg-slate-900/40 backdrop-blur-md border border-slate-800/50 p-6 flex flex-col gap-4 text-left opacity-60 hover:opacity-100 transition-all cursor-not-allowed"
        >
          <div className="bg-indigo-500/10 w-max p-3 rounded-xl border border-indigo-500/20">
            <BookOpen className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-200 mb-1 flex items-center justify-between">
              Postflop Exclusive
              <span className="text-[10px] uppercase font-black tracking-wider bg-slate-800 text-slate-400 px-2 py-1 rounded-md">Coming Soon</span>
            </h3>
            <p className="text-slate-500 text-sm">Train specific board textures and positional matchups (e.g. BTN vs BB on wet boards).</p>
          </div>
        </button>

        <button
          disabled
          className="group relative overflow-hidden rounded-3xl bg-slate-900/40 backdrop-blur-md border border-slate-800/50 p-6 flex flex-col gap-4 text-left opacity-60 hover:opacity-100 transition-all cursor-not-allowed"
        >
          <div className="bg-amber-500/10 w-max p-3 rounded-xl border border-amber-500/20">
            <Dumbbell className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-200 mb-1 flex items-center justify-between">
              Targeted Drills
              <span className="text-[10px] uppercase font-black tracking-wider bg-slate-800 text-slate-400 px-2 py-1 rounded-md">Coming Soon</span>
            </h3>
            <p className="text-slate-500 text-sm">Rapid-fire scenarios generated from your recorded leaks and most common EV blunders.</p>
          </div>
        </button>

        <button
          disabled
          className="group relative overflow-hidden rounded-3xl bg-slate-900/40 backdrop-blur-md border border-slate-800/50 p-6 flex flex-col gap-4 text-left opacity-60 hover:opacity-100 transition-all cursor-not-allowed"
        >
          <div className="bg-cyan-500/10 w-max p-3 rounded-xl border border-cyan-500/20">
            <Calculator className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-200 mb-1 flex items-center justify-between">
              Poker Math
              <span className="text-[10px] uppercase font-black tracking-wider bg-slate-800 text-slate-400 px-2 py-1 rounded-md">Coming Soon</span>
            </h3>
            <p className="text-slate-500 text-sm">Interactive training for pot odds, minimum defense frequencies (MDF), and equity calculations.</p>
          </div>
        </button>

      </div>
    </div>
  );
};
