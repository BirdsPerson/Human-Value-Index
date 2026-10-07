import { lazy, Suspense } from "react";
// The keyboard's way into a storefront's shelves (npcShops.jsx), loaded with the shelves.
const L = lazy(() => import("./npcShops.jsx"));
export default function NpcShopLinks({ pid }) { return <Suspense fallback={null}><L pid={pid} /></Suspense>; }
