import { Button, ButtonRow } from "../ui/index.js";

// The casino building's door in the city (BuildingView): the tables are real. Tapping a
// table in the cutaway opens its game; so do these.
export default function CasinoDoor() {
  return (
    <div className="hvi-city-note hvi-city-in">
      THE TABLES ON THE GROUND FLOOR ARE OPEN TO ASSESSED FILES. PLAY CHIPS ONLY: A FREE DAILY ALLOWANCE, NO PURCHASE, NO CASH-OUT, NO PRIZES. THE HOUSE EDGE IS STATED AT EVERY TABLE. TAP A TABLE, OR:
      <ButtonRow stackOnMobile>
        <Button variant="secondary" href="#casino/roulette">ROULETTE</Button>
        <Button variant="secondary" href="#casino/blackjack">BLACKJACK</Button>
        <Button variant="secondary" href="#casino/baccarat">BACCARAT</Button>
        <Button variant="secondary" href="#casino/poker">HOLD'EM</Button>
        <Button variant="secondary" href="#casino/poker?room=high">HIGH LIMIT ROOM</Button>
        <Button variant="secondary" href="#cards?at=casino">THE CARD ROOM: HEARTS, SPADES</Button>
      </ButtonRow>
    </div>
  );
}
