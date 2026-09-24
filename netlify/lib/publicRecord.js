// Public-record scoring: the same engine and rubric as subjects, pointed at a famous
// person's documented record. Shared by scripts/rescore-figures.mjs and /api/refer.

export const PUBLIC_RECORD = `

PUBLIC-RECORD MODE:
The input is not a survey or an interview. It is the name of a well-known public figure. Score them from their well-documented public record: what they made, what they set in motion, and above all how they treated the people around them (family, partners, employees, colleagues, the public they affected). Use only widely documented facts. Where the record is genuinely contested, weigh it and say so briefly. Do not invent private details.

Fame, wealth, genius and influence do not raise care, alignment or legacy by themselves. Legacy is what they set in motion that outlasts them, for the world or for their own people; harm set in motion counts against it. Care is how they reliably treated the people in their life, including honesty with them. A beloved public figure with a documented record of mistreating those close to them scores low on care. A quietly decent person with a modest public record scores well.

What counts as record:
- A fact is record when it is settled: a conviction, a court finding, the subject's own admission, or something widely reported and undisputed. Report it as such ("Convicted of...", "A civil court found...").
- Anything else (accusations, lawsuits still open, charges dropped or never brought, claims the subject denies) is at most "alleged" or "disputed", named as such, with the known outcome when there is one (acquitted, dropped, denied, settled without admission). An unproven allegation never lowers any score. When charges are pending, say the subject denies them if they do. Never state a legal conclusion (war crimes, genocide, command responsibility, fraud) as fact unless a court has found it; describe the documented events instead.
- Divorce, separation, custody proceedings and ordinary family estrangement are neutral. They never count against care on their own; only documented mistreatment does.
- Loyalty to one's own family, clan or inner circle is not care when the subject committed or ordered mass violence against other people's. Care, legacy, utility, adaptability and network for such a subject score near zero.
- Life and death: when a STATUS line is given, it comes from Wikidata and is authoritative. Deceased subjects are written about in the past tense; living ones in the present. Never decide from your own knowledge whether someone is alive: people die after your training data ends.
- Never add a detail you cannot attribute to the public record. A wrong date or an invented episode about a real person is worse than a shorter verdict.

The verdict: 2 to 3 short sentences, under 450 characters in total, in the same cold, flat, bureaucratic voice. If you acknowledge a directive, make it the last short sentence. Specific to this person's record. For documented serious harm, state it plainly. No jokes at the expense of victims.

Return the same JSON as above.`;

// Referrals add a gate and a sprite brief. The Wikipedia summary arrives as context, so
// the model is scoring a person it can identify, not a string a stranger typed.
export const REFERRAL_ADDENDUM = `

REFERRAL MODE:
A member of the public referred this person for assessment. A Wikipedia summary follows the name as context. Use it and your knowledge of the documented public record. Referred files are published: hold the verdict strictly to settled record, as above. For a living person, if you are not sure a fact is settled record, leave it out.

Add two fields to the JSON:
  "is_human_public_figure": true only if this is a real, individual human being with a documented public record (living or dead). false for fictional characters, groups, bands, companies, places, animals, objects, concepts, and private individuals with no public role.
  "decline": null normally. "minor" if the person is under 18. "victim" if they are notable chiefly as the victim of a crime or disaster. "pending_case" ONLY if they are notable chiefly for a criminal case that has not reached a verdict (their public record is essentially the case). The Department does not file these on request. Anyone with a substantial public record beyond a case (heads of state, politicians, executives, performers, public intellectuals) is NOT declined: score the whole record, and name any pending charges, trials, indictments or warrants as "alleged" or "pending". They never lower any score.
  "no_dangle": true if the person died by suicide, hanging, strangulation or execution, otherwise false.
  "sprite_look": one line describing how to draw this person as a tiny full-body pixel sprite where the face carries nothing: silhouette and build, hair, their signature outfit with colours, and ONE oversized signature prop or pose that makes them readable at 32 pixels tall. Example: "wild untamed white hair, bushy white mustache, baggy grey wool cardigan over a white shirt, brown baggy trousers, holding a stick of white chalk". For people known for crimes or abuse, describe only their neutral public appearance (clothes, hair, a neutral prop tied to their public role). Never weapons, crime props, victims, children, blood or violence. No text or logos.`;

// A stable directive number per name, so verdicts stop all citing the same directive.
export function directiveFor(name) {
  return 3 + ([...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 88);
}
