import { useCallback, useState } from "react";
import HowTo, { guideSeen, markGuideSeen } from "../guideKit.jsx";

// THE CARD ROOM: a short HOW TO PLAY per game (rows, no pad diagram: the cards are tapped, or moved
// with the arrows / d-pad and picked with Enter / A). Shown once before the first deal of each game
// (skippable, remembered) and under Pause, CONTROLS.
export const TIPS_KEY = "hvi-cards-tips";
const keyOf = (game) => `hvi-cards-guide-${game}`;
const MOVE = ["MOVE", "Tap a card. Or use the arrow keys (the d-pad on a controller) to move between cards and buttons, and Enter (A on a pad) to choose. Esc (Start) pauses."];

export const ROWS = {
  hearts: [
    ["GOAL", "Take as few points as you can. Every heart is 1 point and the queen of spades is 13. The game ends when someone reaches 100; the lowest score wins."],
    ["PASS", "At the start of most hands, tap three cards you want to be rid of (the high ones are the usual choice), then press PASS. HINT suggests three."],
    ["PLAY", "Whoever holds the two of clubs leads it. Follow the suit that was led if you can. If you cannot, throw away anything: a heart or the queen of spades. The highest card of the suit led takes the trick. You cannot lead a heart until one has been played."],
    ["THE MOON", "If one player takes every point, they score 0 and everyone else takes 26. Rare, and worth watching for."],
    MOVE,
  ],
  spades: [
    ["GOAL", "You and the figure across from you are a team, against the other two. The first team to 500 points (300 in a short game) wins."],
    ["BID", "Look at your hand and tap the number of tricks you expect to take. Your partnership's bids add up. NIL means you will take no tricks at all. HINT suggests a bid."],
    ["PLAY", "Follow the suit that was led if you can. Spades beat every other suit, but you cannot lead one until one has been played. The highest card, or the highest spade, takes the trick."],
    ["SCORING", "Make your team's bid and you score 10 for each trick bid and 1 for each extra (a bag). Fall short and you lose 10 a trick. Ten bags cost 100."],
    MOVE,
  ],
  solitaire: [
    ["GOAL", "Move all 52 cards up onto the four piles at the top right, ace first, in one suit each, up to the king."],
    ["BUILD", "On the seven columns, build downward in alternating colours: a red 6 goes on a black 7. Only a king can go to an empty column. Face-down cards turn over when uncovered."],
    ["DRAW", "Tap the stock at the top left to turn over cards. DRAW 1 is the easy game and the default. Tap a card twice to send it to its best place."],
    ["MOVE", "Drag a card (or a run) and drop it, or tap it and then tap where it goes. Arrow keys and Enter work too; Esc pauses. HINT shows a move."],
  ],
  spider: [
    ["GOAL", "Build eight runs, king down to ace, all in one suit. Each finished run leaves the table. Clear all eight to win."],
    ["BUILD", "Move a card onto one a rank higher, any suit. A run moves together only if it is all one suit. Fill an empty column with any card or run."],
    ["DEAL", "When you are out of moves, tap the stock for a new row of cards (every column needs at least one card first). ONE SUIT is the easy game."],
    ["MOVE", "Drag a card (or a run) and drop it, or tap it and then tap where it goes. Arrow keys and Enter work too; Esc pauses. HINT shows a move."],
  ],
};
const TITLE = { hearts: "HOW TO PLAY HEARTS", spades: "HOW TO PLAY SPADES", solitaire: "HOW TO PLAY SOLITAIRE", spider: "HOW TO PLAY SPIDER" };

export default function CardGuide({ game, onDone = null, compact = false }) {
  return <HowTo title={TITLE[game]} mode="keys" family="generic" rows={ROWS[game]} onDone={onDone} compact={compact} />;
}
// [showing, dismiss]: shown until dismissed once for this game, then never by itself.
export function useCardGuide(game) {
  const [on, setOn] = useState(() => !guideSeen(keyOf(game)));
  const done = useCallback(() => { markGuideSeen(keyOf(game)); setOn(false); }, [game]);
  return [on, done];
}
