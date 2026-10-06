// THE SHOPS' stores: where each stands (rooms the city already has: no new place, no plan change)
// and what it is. Light on purpose: the city's district and building rows import only this.
export const STORES = [
  { id: "thrift", name: "SECOND FILE THRIFT", tier: "thrift", district: "oldtown", building: "market-row", place: "market-row", where: "MARKET ROW, THE OLD TOWN",
    line: "PREVIOUSLY OWNED. PREVIOUSLY ASSESSED. LAUNDERED ONCE.", wall: "#3a2e24", accent: "#d9b35c", kind: "clothes" },
  { id: "eastgate", name: "EASTGATE DEPARTMENT STORE", tier: "dept", district: "suburbs", building: "eastgate-mall", place: "eastgate", where: "EASTGATE MALL, THE SUBURBS",
    line: "EVERYTHING A CITIZEN NEEDS, ON TWO FLOORS. THE ESCALATOR IS MONITORED.", wall: "#26323a", accent: "#7fb3ff", kind: "clothes" },
  { id: "eastgate-home", name: "EASTGATE HOME", tier: "dept", district: "suburbs", building: "eastgate-mall", place: "eastgate", where: "EASTGATE MALL, UPPER FLOOR",
    line: "FURNISH THE FLAT YOU WERE ASSIGNED. THE DEPARTMENT WILL NOT TAKE IT BACK. IT WILL NOT TAKE THE SOFA BACK EITHER.", wall: "#2c2a22", accent: "#e8c860", kind: "furniture" },
  { id: "maison", name: "MAISON MERIDIAN", tier: "boutique", district: "finance", building: "the-meridian", place: "penthouses", where: "THE MERIDIAN LOBBY ARCADE, FINANCE",
    line: "BY APPOINTMENT, WHICH YOU NOW HAVE. THE MIRROR IS A CAMERA.", wall: "#1d2b33", accent: "#c9a34a", kind: "clothes" },
];
export const storeOf = (id) => STORES.find(s => s.id === id) || null;
export const storesIn = (buildingId) => STORES.filter(s => s.building === buildingId);
export const storesInDistrict = (districtId) => STORES.filter(s => s.district === districtId);

