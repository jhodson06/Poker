import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import gsap from 'gsap';
import { TableState } from '../engine/stateMachine';
import { SUIT_SYMBOLS, RANKS } from '../engine/card';
import { evaluate7Cards } from '../engine/evaluator';

interface PokerTableCanvasProps {
  tableState: TableState;
}

export const PokerTableCanvas: React.FC<PokerTableCanvasProps> = ({ tableState }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    let isDestroyed = false;

    // Fixed Virtual Canvas Size: 1000 x 560
    app.init({
      width: 1000,
      height: 560,
      backgroundColor: 0x080c14,
      antialias: true,
      resolution: window.devicePixelRatio || 1
    }).then(() => {
      if (isDestroyed || !containerRef.current) return;

      app.canvas.style.width = '100%';
      app.canvas.style.height = 'auto';
      app.canvas.style.maxHeight = '560px';
      app.canvas.style.display = 'block';

      containerRef.current.appendChild(app.canvas);
      appRef.current = app;
      renderTableScene(app, tableState);
    });

    return () => {
      isDestroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [tableState.playerCount]);

  useEffect(() => {
    if (appRef.current) {
      renderTableScene(appRef.current, tableState);
    }
  }, [tableState]);

  const renderTableScene = (app: PIXI.Application, state: TableState) => {
    gsap.killTweensOf(app.stage.children);
    app.stage.removeChildren();

    const width = 1000;
    const height = 560;
    const centerX = width / 2;
    const centerY = height / 2 - 10;

    // 1. Table Outer Rail (Wood & Felt)
    const railGraphics = new PIXI.Graphics();
    
    // Wood Rail
    railGraphics.ellipse(centerX, centerY, 370, 200);
    railGraphics.fill({ color: 0x221309 });
    railGraphics.stroke({ color: 0x4a2a18, width: 8 });

    // Gold Trim Ring
    railGraphics.ellipse(centerX, centerY, 355, 185);
    railGraphics.stroke({ color: 0xd97706, width: 2.5 });

    // Inner Emerald Felt
    railGraphics.ellipse(centerX, centerY, 345, 175);
    railGraphics.fill({ color: 0x064e3b });
    railGraphics.stroke({ color: 0x047857, width: 3 });

    // Table Felt Logo
    const watermarkText = new PIXI.Text({
      text: 'GTO TRAINER',
      style: {
        fontFamily: 'Outfit, sans-serif',
        fontSize: 24,
        fontWeight: '800',
        fill: 0x047857,
        letterSpacing: 8
      }
    });
    watermarkText.anchor.set(0.5);
    watermarkText.x = centerX;
    watermarkText.y = centerY - 72;
    watermarkText.alpha = 0.35;

    app.stage.addChild(railGraphics, watermarkText);

    // 2. Main Pot Container Display
    const potContainer = new PIXI.Container();
    potContainer.x = centerX;
    potContainer.y = centerY - 32;

    const potChipStack = createChipStackSprite(state.pot);
    potChipStack.x = -65;
    potChipStack.y = 0;

    const potBg = new PIXI.Graphics();
    potBg.roundRect(-85, -22, 170, 44, 22);
    potBg.fill({ color: 0x0f172a, alpha: 0.94 });
    potBg.stroke({ color: 0x10b981, width: 2.5 });

    const potText = new PIXI.Text({
      text: `POT: ${state.pot} BB`,
      style: {
        fontFamily: 'Outfit, sans-serif',
        fontSize: 16,
        fontWeight: '900',
        fill: 0x34d399
      }
    });
    potText.anchor.set(0.5);

    potContainer.addChild(potBg, potText);
    app.stage.addChild(potChipStack, potContainer);

    // 3. Community Cards Rendering
    // At showdown: show all dealt cards at full brightness, plus any undealt phantom cards
    // (the actual cards that would have been dealt) in grey at 0.60 opacity.
    // During play: only show actually-dealt cards.
    {
      const isShowdown = state.street === 'showdown';
      const dealtCount = state.communityCards ? state.communityCards.length : 0;
      const phantom = state.phantomCommunityCards || [];
      const totalSlots = isShowdown ? Math.max(5, dealtCount, phantom.length) : dealtCount;

      if (totalSlots > 0) {
        const cardSpacing = 56;
        const startX = centerX - ((Math.min(totalSlots, 5) - 1) * cardSpacing) / 2;

        for (let idx = 0; idx < Math.min(totalSlots, 5); idx++) {
          const isDealt = idx < dealtCount;
          const phantomCard = phantom[idx]; // Full runout card at this position

          if (isDealt) {
            // Actually dealt — full brightness
            const card = state.communityCards[idx];
            const cardGraphic = createCardSprite(card.rank, card.suit, 46, 66);
            cardGraphic.x = startX + idx * cardSpacing;
            cardGraphic.y = centerY + 18;
            cardGraphic.alpha = 1.0;
            app.stage.addChild(cardGraphic);
          } else if (isShowdown && phantomCard) {
            // Phantom (undealt) — show the actual card that would have come, fully visible but greyed
            const cardGraphic = createCardSprite(phantomCard.rank, phantomCard.suit, 46, 66, true);
            cardGraphic.x = startX + idx * cardSpacing;
            cardGraphic.y = centerY + 18;
            cardGraphic.alpha = 1.0; // Full visibility — grey styling does the visual work
            app.stage.addChild(cardGraphic);
          } else if (isShowdown) {
            // No phantom data available — fallback to ? placeholder
            const ph = createPhantomCardSprite(46, 66);
            ph.x = startX + idx * cardSpacing;
            ph.y = centerY + 18;
            ph.alpha = 1.0; // Fully visible — grey card face handles the muted look
            app.stage.addChild(ph);
          }
        }
      }
    }

    // 4. Render Player Seats, Bet Chips & Cards
    const seatsCount = state.playerCount;
    const heroSeatIndex = state.players.findIndex(p => p.isHuman);

    const rx = 330;
    const ry = 170;

    state.players.forEach((player, i) => {
      const relativeIndex = (i - heroSeatIndex + seatsCount) % seatsCount;
      const angle = (Math.PI / 2) + (relativeIndex * 2 * Math.PI) / seatsCount;
      const px = centerX + rx * Math.cos(angle);
      const py = centerY + ry * Math.sin(angle);

      const seatGroup = new PIXI.Container();
      seatGroup.x = px;
      seatGroup.y = py;

      const isCurrentActive = state.activeSeat === i && state.street !== 'showdown';

      // --- HOLE CARDS RENDERING ---
      // For Hero: Always render hole cards (even when folded, at 0.78 opacity for crystal clear visibility).
      // For Villains: Render ONLY if not folded, OR if at showdown!
      const shouldRenderHoleCards = player.holeCards.length === 2 && (
        player.isHuman || (!player.isFolded || state.street === 'showdown')
      );

      if (shouldRenderHoleCards) {
        const isShowable = player.isHuman || state.street === 'showdown';

        const cardW = player.isHuman ? 48 : 36;
        const cardH = player.isHuman ? 68 : 50;
        const offsetLeftX = player.isHuman ? -15 : -11;
        const offsetRightX = player.isHuman ? 15 : 11;
        const offsetY = player.isHuman ? -32 : -26;

        const c1 = isShowable
          ? createCardSprite(player.holeCards[0].rank, player.holeCards[0].suit, cardW, cardH, player.isFolded)
          : createCardBackSprite(cardW, cardH);
        c1.x = offsetLeftX;
        c1.y = offsetY;
        c1.rotation = -0.22;
        c1.alpha = 1.0;

        const c2 = isShowable
          ? createCardSprite(player.holeCards[1].rank, player.holeCards[1].suit, cardW, cardH, player.isFolded)
          : createCardBackSprite(cardW, cardH);
        c2.x = offsetRightX;
        c2.y = offsetY;
        c2.rotation = 0.22;
        c2.alpha = 1.0;

        seatGroup.addChild(c1, c2);
      }

      // No seat-level dimming — grey card styling handles folded appearance for all players
      if (player.isFolded) {
        seatGroup.alpha = 1.0;
      }

      // Active player pulsing ring
      if (isCurrentActive) {
        const ring = new PIXI.Graphics();
        ring.circle(0, 0, 44);
        ring.fill({ color: 0x10b981, alpha: 0.25 });
        ring.stroke({ color: 0x34d399, width: 3 });
        seatGroup.addChild(ring);
      }

      // HERO Distinction Outer Glow Ring
      if (player.isHuman) {
        const heroRing = new PIXI.Graphics();
        heroRing.circle(0, 0, 40);
        heroRing.fill({ color: 0x3b82f6, alpha: 0.25 });
        heroRing.stroke({ color: player.isFolded ? 0x64748b : 0xfacc15, width: 3 });
        seatGroup.addChild(heroRing);
      }

      const isWinner = state.street === 'showdown' && state.winners?.some(w => w.seatIndex === player.seatIndex);

      // Avatar Circle (Radius 34px)
      const avatar = new PIXI.Graphics();
      avatar.circle(0, 0, 34);
      avatar.fill({
        color: player.isHuman ? (player.isFolded ? 0x1e293b : 0x1d4ed8) : player.isFolded ? 0x334155 : 0x0f172a
      });
      avatar.stroke({
        color: player.isHuman ? (player.isFolded ? 0x64748b : 0xfacc15) : isCurrentActive ? 0x10b981 : 0x475569,
        width: player.isHuman ? 3 : 2
      });
      seatGroup.addChild(avatar);

      // Winner highlight ring — drawn AFTER avatar so it sits on top
      if (isWinner) {
        const winRing = new PIXI.Graphics();
        winRing.circle(0, 0, 34);
        winRing.fill({ color: 0x000000, alpha: 0 });
        winRing.stroke({ color: 0x22c55e, width: 2.5 });
        seatGroup.addChild(winRing);
      }

      // CENTER OF CIRCLE TEXT: Position Name for ALL players (SB, BB, BTN, etc.)
      const centerNameText = new PIXI.Text({
        text: player.position,
        style: {
          fontFamily: 'Outfit, sans-serif',
          fontSize: 15,
          fontWeight: '900',
          fill: player.isHuman ? (player.isFolded ? 0x94a3b8 : 0xfacc15) : 0xffffff
        }
      });
      centerNameText.anchor.set(0.5);
      centerNameText.y = -4;
      seatGroup.addChild(centerNameText);

      // ACTION TAG - Directly under player circle, SLIGHTLY OVERLAPPING bottom edge (y = 26)
      if (player.lastAction) {
        const actionTag = new PIXI.Container();
        actionTag.y = 26;

        const tagBg = new PIXI.Graphics();
        tagBg.roundRect(-42, -10, 84, 20, 10);
        tagBg.fill({ color: 0x0f172a, alpha: 0.98 });
        tagBg.stroke({ color: player.lastAction.includes('Fold') ? 0xf43f5e : 0x10b981, width: 1.5 });

        const tagText = new PIXI.Text({
          text: player.lastAction,
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            fontWeight: '900',
            fill: player.lastAction.includes('Fold') ? 0xf43f5e : 0x34d399
          }
        });
        tagText.anchor.set(0.5);

        actionTag.addChild(tagBg, tagText);
        seatGroup.addChild(actionTag);
      }

      // STACK COUNT BELOW ACTION TAG: y = 50
      const stackText = new PIXI.Text({
        text: `${player.chips} BB`,
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          fontWeight: '800',
          fill: player.isHuman ? 0xfacc15 : 0xcbd5e1
        }
      });
      stackText.anchor.set(0.5);
      stackText.y = 50;
      seatGroup.addChild(stackText);

      // --- SUBTLE HERO HAND RANK BADGE (PERSISTS AFTER FOLD AT Y = 90) ---
      if (player.isHuman && player.holeCards.length === 2) {
        let handRankCategory = 'HIGH CARD';

        if (state.communityCards && state.communityCards.length >= 3) {
          const evalResult = evaluate7Cards([...player.holeCards, ...state.communityCards]);
          handRankCategory = evalResult.category.toUpperCase();
        } else {
          const c1 = player.holeCards[0];
          const c2 = player.holeCards[1];
          if (c1.value === c2.value) {
            handRankCategory = `PAIR OF ${RANKS[c1.value]}S`;
          } else {
            const highRank = RANKS[Math.max(c1.value, c2.value)];
            handRankCategory = `${highRank}-HIGH`;
          }
        }

        const heroHandBadge = new PIXI.Container();
        heroHandBadge.y = 90;

        const textLength = handRankCategory.length;
        const badgeWidth = Math.max(90, textLength * 7.5 + 20);

        const badgeBg = new PIXI.Graphics();
        badgeBg.roundRect(-badgeWidth / 2, -10, badgeWidth, 20, 10);
        badgeBg.fill({ color: 0x0f172a, alpha: 0.85 });
        badgeBg.stroke({ color: player.isFolded ? 0x334155 : 0x0284c7, width: 1.2 });

        const badgeText = new PIXI.Text({
          text: handRankCategory,
          style: {
            fontFamily: 'Outfit, sans-serif',
            fontSize: 10,
            fontWeight: '800',
            fill: player.isFolded ? 0x64748b : 0x38bdf8
          }
        });
        badgeText.anchor.set(0.5);

        heroHandBadge.addChild(badgeBg, badgeText);
        seatGroup.addChild(heroHandBadge);
      }

      // Dealer Button
      if (state.dealerSeat === i) {
        const btn = new PIXI.Graphics();
        btn.circle(30, -24, 11);
        btn.fill({ color: 0xfacc15 });
        btn.stroke({ color: 0x78350f, width: 2 });

        const btnText = new PIXI.Text({
          text: 'D',
          style: { fontFamily: 'Outfit, sans-serif', fontSize: 11, fontWeight: '800', fill: 0x000000 }
        });
        btnText.anchor.set(0.5);
        btnText.x = 30;
        btnText.y = -24;

        seatGroup.addChild(btn, btnText);
      }

      // 5. Active Bet Chips
      if (player.currentBet > 0 && !player.isFolded) {
        const betChipsGroup = new PIXI.Container();
        const vectorScale = player.isHuman ? 0.65 : 0.44;
        const chipVectorX = (centerX - px) * vectorScale;
        const chipVectorY = (centerY - py) * vectorScale;
        betChipsGroup.x = px + chipVectorX;
        betChipsGroup.y = py + chipVectorY;

        const chipGraphic = createChipStackSprite(player.currentBet);

        const betBadgeBg = new PIXI.Graphics();
        betBadgeBg.roundRect(-30, -10, 60, 20, 10);
        betBadgeBg.fill({ color: 0x0f172a, alpha: 0.95 });
        betBadgeBg.stroke({ color: 0x38bdf8, width: 1.5 });

        const betBadgeText = new PIXI.Text({
          text: `${player.currentBet} BB`,
          style: {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            fontWeight: '800',
            fill: 0x38bdf8
          }
        });
        betBadgeText.anchor.set(0.5);

        const badgeGroup = new PIXI.Container();
        badgeGroup.y = 16;
        badgeGroup.addChild(betBadgeBg, betBadgeText);

        betChipsGroup.addChild(chipGraphic, badgeGroup);
        app.stage.addChild(betChipsGroup);
      }

      app.stage.addChild(seatGroup);
    });

    // 6. Showdown Winner Banner Overlay
    if (state.street === 'showdown' && state.winners && state.winners.length > 0) {
      const winnerBanner = new PIXI.Container();
      winnerBanner.x = centerX;
      winnerBanner.y = centerY + 58; // Moved up from +95 to avoid covering hero cards

      const bg = new PIXI.Graphics();
      bg.roundRect(-180, -24, 360, 48, 14);
      bg.fill({ color: 0x064e3b, alpha: 0.95 });
      bg.stroke({ color: 0x34d399, width: 2.5 });

      const winMsg = state.winners.map(w => {
        const p = state.players[w.seatIndex];
        const isHero = p?.isHuman || w.name === 'You';
        const nameStr = p ? (p.isHuman ? 'You' : p.position) : w.name;
        return `${nameStr} ${isHero ? 'win' : 'wins'} ${w.amount} BB`;
      }).join(' | ');
      const winText = new PIXI.Text({
        text: winMsg,
        style: {
          fontFamily: 'Outfit, sans-serif',
          fontSize: 15,
          fontWeight: '800',
          fill: 0x6ee7b7
        }
      });
      winText.anchor.set(0.5);

      winnerBanner.addChild(bg, winText);
      app.stage.addChild(winnerBanner);
    }
  };

  const createChipStackSprite = (amountBB: number): PIXI.Container => {
    const chipGroup = new PIXI.Container();
    const chipCount = Math.min(6, Math.max(1, Math.floor(amountBB / 2)));

    let color = 0xef4444;
    let border = 0xfca5a5;
    if (amountBB >= 25) { color = 0x10b981; border = 0x6ee7b7; }
    if (amountBB >= 50) { color = 0x0f172a; border = 0x38bdf8; }

    for (let c = 0; c < chipCount; c++) {
      const chip = new PIXI.Graphics();
      const chipY = -c * 4;
      
      chip.ellipse(0, chipY, 14, 7);
      chip.fill({ color });
      chip.stroke({ color: border, width: 1.5 });

      chipGroup.addChild(chip);
    }

    return chipGroup;
  };

  // faded = true: fully grey card for folded/phantom state — no opacity, pure colour dulling
  const createCardSprite = (rank: string, suit: string, cardW: number, cardH: number, faded: boolean = false): PIXI.Container => {
    const card = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
    bg.fill({ color: faded ? 0xa0aec0 : 0xffffff }); // Darker grey when folded, white when active
    bg.stroke({ color: faded ? 0x64748b : 0x334155, width: 1.5 });

    // Keep original suit colours (red hearts, blue diamonds etc.) even on grey cards — still readable
    const colorHex = suit === 'h' ? 0xf43f5e : suit === 'd' ? 0x0284c7 : suit === 'c' ? 0x059669 : 0x0f172a;
    const suitSymbol = SUIT_SYMBOLS[suit as keyof typeof SUIT_SYMBOLS] || '♠';

    const cornerText = new PIXI.Text({
      text: `${rank}${suitSymbol}`,
      style: {
        fontFamily: 'Outfit, sans-serif',
        fontSize: cardW > 40 ? 14 : 11,
        fontWeight: '900',
        fill: colorHex
      }
    });
    cornerText.anchor.set(0, 0);
    cornerText.x = -cardW / 2 + 4;
    cornerText.y = -cardH / 2 + 3;

    const centerSuitText = new PIXI.Text({
      text: suitSymbol,
      style: {
        fontFamily: 'Outfit, sans-serif',
        fontSize: cardW > 40 ? 22 : 16,
        fontWeight: '900',
        fill: colorHex
      }
    });
    centerSuitText.anchor.set(0.5);
    centerSuitText.x = 2;
    centerSuitText.y = 4;

    card.addChild(bg, cornerText, centerSuitText);
    return card;
  };

  // Phantom card for undealt community slots at showdown — light grey face, dashed outline
  const createPhantomCardSprite = (cardW: number, cardH: number): PIXI.Container => {
    const card = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
    bg.fill({ color: 0xd4d4d4 }); // Light grey face
    bg.stroke({ color: 0x94a3b8, width: 1.5 });

    // Subtle question mark in center
    const qText = new PIXI.Text({
      text: '?',
      style: {
        fontFamily: 'Outfit, sans-serif',
        fontSize: cardW > 40 ? 20 : 14,
        fontWeight: '900',
        fill: 0x94a3b8
      }
    });
    qText.anchor.set(0.5);
    qText.x = 0;
    qText.y = 2;

    card.addChild(bg, qText);
    return card;
  };

  const createCardBackSprite = (cardW: number, cardH: number): PIXI.Container => {
    const card = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 5);
    bg.fill({ color: 0x0f172a });
    bg.stroke({ color: 0x3b82f6, width: 1.5 });

    const pattern = new PIXI.Graphics();
    pattern.roundRect(-cardW / 2 + 3, -cardH / 2 + 3, cardW - 6, cardH - 6, 3);
    pattern.fill({ color: 0x2563eb, alpha: 0.35 });

    card.addChild(bg, pattern);
    return card;
  };

  return (
    <div className="w-full flex justify-center items-center py-1">
      <div
        ref={containerRef}
        className="w-full max-w-5xl rounded-3xl overflow-hidden glass-panel shadow-2xl border border-slate-800 flex justify-center items-center"
      />
    </div>
  );
};
