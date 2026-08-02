# ♠️ GTO Poker Trainer

An interactive, real-time GTO (Game Theory Optimal) Texas Hold'em training web application built with **React**, **TypeScript**, **PixiJS**, and **TailwindCSS**. 

Improve your poker decision-making with instant Nash Equilibrium feedback, expected value (EV) loss calculations, leak tracking, an interactive 13x13 solution matrix, and diagnostic session logging.

---

## 🌟 Key Features

### 1. 🎴 Interactive 2D Poker Table Canvas
* **PixiJS WebGL Engine**: Ultra-smooth 60fps rendering of table felt, player avatars, active turn timers, community cards, dealer buttons, and pot chip stacks.
* **Smart Fold & Winner Visuals**: Folded cards remain fully visible with a darkened gray tone for transparency-free readability. Hand winners are highlighted with subtle green glowing rings around their avatar.
* **Phantom Board Cards**: See what cards would have been dealt on folded/uncontested hands to check if your draws would have hit.

### 2. ⚡ Real-Time GTO Strategy & EV Loss Feedback
* **Instant Decision Evaluation**: Every Hero move is graded instantly:
  * 🟢 **Correct** (0.00 BB EV Loss) — Optimal GTO line or high-frequency strategy.
  * 🟡 **Inaccuracy** — Minor EV loss or frequency overuse leak.
  * 🔴 **Mistake / Blunder** — Substantial EV deviation from Nash Equilibrium.
* **Leak & Overuse Detection**: Monitors your session usage ratio for low-frequency mixed lines (e.g. 5-15% checks/bluffs) and alerts you when overusing them.

### 3. 🗺️ Interactive 13x13 GTO Solution Matrix
* **Auto-Syncing Range Heatmap**: Browses all 169 hand combinations (`Pairs`, `Suited`, `Offsuit`).
* **Live Table Context**: Automatically opens set to your current table seat, hole cards, and street.
* **Multi-Street & Position Ranges**: Switch between positions (`UTG`, `MP`, `CO`, `BTN`, `SB`, `BB`) and streets (`Preflop`, `Flop`, `Turn`, `River`) to inspect solver action distributions and expected values.

### 4. 📝 Diagnostic Logging & TXT Export
* **Detailed Hand Logging**: Every action, pot size, high bet, stack depth, dealt board card, phantom card, GTO node, decision grade, and showdown hand evaluation description is logged in real time.
* **One-Click Exports**: Download `.txt` log files post-hand with unique random IDs to prevent overwriting:
  * **Current Round Log** — Diagnostic text report for the hand just played.
  * **Full Session Log** — Complete diagnostic history of all hands played in the session.

### 5. ⚙️ Customizable Game Settings
* **Table Seats**: 2-Max (Heads-Up) to 6-Max ring games.
* **Stack Rules**: Persistent Cash Game stacks vs. Reset Each Hand.
* **Stack Depths**: 50 BB, 100 BB, or 200 BB deep stack play.
* **Action Spaces**:
  * **Simple Mode**: `Fold`, `Check/Call`, `Bet/Raise`.
  * **Grouped Mode**: Categorized GTO bucket lines.
  * **Standard Mode**: Pot-aware percentage bet sizing (`33%`, `50%`, `75%`, `100%`, `All-In`).

---

## 🛠️ Technology Stack

* **Core**: React 18, TypeScript, Vite 6
* **Canvas Graphics**: PixiJS 8
* **Styling**: TailwindCSS 4, Lucide Icons, Google Fonts (Outfit, Inter, JetBrains Mono)
* **Effects**: Canvas-Confetti

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jhodson06/Poker.git
   cd Poker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

---

## 📦 Building for Production

To create an optimized production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.