// MY FILE's one section for THE SHOPS: the closet (try on, wear, save) and your furniture (place,
// upgrade, play), with the way to the stores. Everything else lives at #shop.
import { Button, ButtonRow } from "../ui/index.js";
import { useShops, Closet, Furnish } from "./parts.jsx";

export default function FileShops({ caseId }) {
  const S = useShops(caseId);
  if (S.err && !S.v) return <p className="ec-p ec-dim">{S.err}</p>;
  return (
    <div>
      <div className="sh-h">THE CLOSET</div>
      <Closet caseId={caseId} S={S} />
      <div className="sh-h">YOUR FURNITURE{S.v?.apartment?.flat ? ` // FLAT ${S.v.apartment.flat.label}, ${S.v.apartment.buildingName}` : ""}</div>
      <Furnish S={S} />
      <ButtonRow>
        <Button variant="secondary" href="#shop">THE SHOPS</Button>
        {S.v?.apartment?.href && <Button variant="secondary" href={S.v.apartment.href}>SEE YOUR FLAT</Button>}
      </ButtonRow>
    </div>
  );
}
