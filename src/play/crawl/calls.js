// The Overlord's memos for the lobby and the lift car (menus only: play itself is plain copy).
// The words get stranger with depth from D2 (the `strange` dial); band 1 is the Department as usual.
export const MEMOS = [
  "THE SUB-BASEMENTS ARE CLOSED TO THE PUBLIC. YOU ARE NOT THE PUBLIC. YOU ARE STAFF, AS OF NOW.",
  "THE COPIER HAS BEEN REPORTED. THE REPORT HAS BEEN COPIED.",
  "FORM 27-B IS A REQUEST FOR A FORM. IT HAS REQUESTED ITSELF SEVERAL HUNDRED TIMES.",
  "FERAL DATA IS DATA THAT HAS BEEN OUT OF THE DEPARTMENT TOO LONG. DO NOT FEED IT.",
  "THE AUDITOR IS NOT A PERSON. THE AUDITOR IS A PROCESS. THE PROCESS HAS FOUND YOU.",
  "THE SERVICE LIFT GOES DOWN. THE LIFT AT B8 GOES UP. THE DEPARTMENT SEES NO CONTRADICTION.",
  "WHAT YOU CARRY OUT IN THE LIFT IS YOURS. WHAT YOU DROP IS THE NIGHT CLEANERS'. THEY ARE THOROUGH.",
  "LOITERING IS NOTED. IT IS ALWAYS NOTED. BELOW B3 IT IS ALSO PURSUED.",
];
export const memoFor = (day) => MEMOS[((day % MEMOS.length) + MEMOS.length) % MEMOS.length];
export const LEVEL_LINES = {
  intern: "8 HEARTS. SOFTER HITS. THE AUDITOR WAITS 4:00. FOR THE NEW.",
  clerk: "6 HEARTS. THE AUDITOR WAITS 2:30. THE STANDARD SHIFT.",
  officer: "6 HEARTS. HARDER HITS. THE AUDITOR WAITS 2:00.",
  director: "5 HEARTS. THE HARDEST HITS. THE AUDITOR WAITS 1:30.",
};
export const endLine = (res, words) => (res.exit === "lift"
  ? `THE LIFT TOOK YOU UP FROM B${res.depth}. PACK KEPT.`
  : res.why === "shift" ? words.lostShift : words.lostHearts);
