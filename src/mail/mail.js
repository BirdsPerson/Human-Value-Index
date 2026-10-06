// DEPARTMENT MAIL, the shared half (docs/design/COMMS.md, layer 1). Pure and light: the client
// (src/mail/Mail.jsx), the server (netlify/functions/mail.js) and scripts/check-mail.mjs all read
// it. No user writes a word of any letter: every letter is generated from the city's own events
// (netlify/lib/mail-gen.js), and the only things a reader changes are flags (read, archived,
// deleted). The inbox lives server-side under the case (Blobs store "hvi-mail", key c:<caseId>),
// is purged with the file and expires with it (docs/legal/privacy.md).
//
// The stored inbox: {v, first: "YYYY-MM-DD" (the first delivery), days: [the delivery dates, newest
// first, at most DAYS_KEPT], mail: [letters, newest first, at most KEEP]}
// A letter: {id, day, at (ms), kind, folder (its home folder), from: {name, addr}, subject,
// body: [paragraphs], action: {label, href} | null, read, archived, deleted (ms, soft) }

export const MAIL_V = 1;
export const FOLDERS = ["inbox", "offers", "notices", "archive"];
export const FOLDER_NAME = { inbox: "INBOX", offers: "OFFERS", notices: "NOTICES", archive: "ARCHIVE", trash: "DELETED" };
export const PER_DAY = 4;                       // new letters a real day, at most (the orientation letter on top, once)
export const KEEP = 150;                        // letters kept per file; the oldest go first
export const DAYS_KEPT = 60;                    // delivery dates remembered (a date is delivered once)
export const TRASH_DAYS = 30;                   // a deleted letter is gone for good after this
export const RETAIN_MS = 730 * 24 * 3600 * 1000; // 24 months, the case file's own retention
export const OPS = ["read", "unread", "archive", "unarchive", "delete", "restore", "readall"];

// Where a letter's action may point: the site's own rooms, never off-site (no links in letters
// lead anywhere a stranger chose).
export const validAction = (a) => Boolean(a && typeof a.label === "string" && a.label.length <= 40 && typeof a.href === "string" && /^#[a-z][a-z0-9/?=&.-]{0,80}$/.test(a.href));

export const newInbox = () => ({ v: MAIL_V, first: null, days: [], mail: [] });

// The folder a letter shows in now: archived letters in ARCHIVE, the rest in their home folder;
// deleted letters in none (the trash is not a folder the reader browses).
export const folderOf = (m) => (m.deleted ? "trash" : m.archived ? "archive" : m.folder);

// Unread: in a live folder (not archived, not deleted) and not read.
export const unreadIn = (inbox, folder = null) => (inbox?.mail || []).filter(m => !m.read && !m.deleted && !m.archived && (!folder || m.folder === folder)).length;

// What the reader is sent: the live letters, the counts per folder, nothing else of the store.
export function viewOf(inbox) {
  const mail = (inbox?.mail || []).filter(m => !m.deleted);
  const counts = Object.fromEntries(FOLDERS.map(f => [f, { n: mail.filter(m => folderOf(m) === f).length, unread: f === "archive" ? 0 : unreadIn(inbox, f) }]));
  return { v: MAIL_V, unread: unreadIn(inbox), counts, mail: mail.map(({ id, day, at, kind, folder, from, subject, body, action, read, archived }) => ({ id, day, at, kind, folder, from, subject, body, action, read: Boolean(read), archived: Boolean(archived) })) };
}

// One flag change. -> {inbox, changed} (the inbox untouched when the letter is not there).
export function applyOp(inbox, op, id, nowMs = Date.now()) {
  if (!OPS.includes(op)) return { inbox, changed: false, error: "NO SUCH OPERATION. THE MAIL ROOM READS, FILES AND SHREDS. NOTHING ELSE." };
  const mail = (inbox?.mail || []).map(m => ({ ...m }));
  if (op === "readall") {
    let changed = false;
    for (const m of mail) if (!m.read && !m.deleted && (!id || m.folder === id) && !m.archived) { m.read = true; changed = true; }
    return { inbox: { ...inbox, mail }, changed };
  }
  const m = mail.find(x => x.id === id);
  if (!m) return { inbox, changed: false, error: "NO SUCH LETTER. IT MAY HAVE BEEN SHREDDED." };
  const before = JSON.stringify(m);
  if (op === "read") m.read = true;
  else if (op === "unread") m.read = false;
  else if (op === "archive") { m.archived = true; m.read = true; }
  else if (op === "unarchive") m.archived = false;
  else if (op === "delete") m.deleted = nowMs;
  else if (op === "restore") m.deleted = 0;
  return { inbox: { ...inbox, mail }, changed: JSON.stringify(m) !== before };
}

// Housekeeping on every write: the trash emptied after TRASH_DAYS, letters older than the file's
// retention dropped, at most KEEP kept (the oldest go).
export function tidy(inbox, nowMs = Date.now()) {
  const mail = (inbox?.mail || []).filter(m => !(m.deleted && nowMs - m.deleted > TRASH_DAYS * 86400000) && nowMs - (m.at || 0) < RETAIN_MS)
    .sort((a, b) => (b.at || 0) - (a.at || 0) || (a.id < b.id ? -1 : 1)).slice(0, KEEP);
  return { ...inbox, mail, days: (inbox?.days || []).slice(0, DAYS_KEPT) };
}

// Today's letters into the inbox, once per date: -> {inbox, added}. A date already delivered adds
// nothing (so a reload, a second tab or a retry never doubles the post), and an id already on file
// is never added twice.
export function deliver(inbox, date, letters, nowMs = Date.now()) {
  const I = inbox || newInbox();
  if ((I.days || []).includes(date)) return { inbox: I, added: 0 };
  const have = new Set((I.mail || []).map(m => m.id));
  const fresh = letters.filter(m => !have.has(m.id));
  const next = tidy({ ...I, first: I.first || date, days: [date, ...(I.days || [])], mail: [...fresh, ...(I.mail || [])] }, nowMs);
  return { inbox: next, added: fresh.length };
}
