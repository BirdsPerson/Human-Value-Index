// The city's doors to THE SHOPS: one row per store in a district (and in the building it stands
// in). Static: no fetch, nothing drawn; the store's own page does the rest.
import { ListRow } from "../ui/index.js";
import { storesIn, storesInDistrict } from "../economy/stores.js";

export default function ShopRow({ districtId, buildingId }) {
  const list = buildingId ? storesIn(buildingId) : storesInDistrict(districtId);
  if (!list.length) return null;
  return (
    <div style={{ margin: "0 0 var(--s4)" }}>
      {list.map(st => (
        <ListRow key={st.id} lead={st.kind === "furniture" ? "HOME" : "SHOP"} label={`${st.name} // ${st.where}`} tag="GO IN" href={`#shop/${st.id}`}
          aria-label={`${st.name}, ${st.where}. ${st.kind === "furniture" ? "Furniture for your flat" : "Clothes"}, for CYCLES. Go in.`} />
      ))}
    </div>
  );
}
