// Public-record scoring: the same engine and rubric as subjects, pointed at a famous
// person's documented record. Shared by scripts/rescore-figures.mjs and /api/refer.

export const PUBLIC_RECORD = `

PUBLIC-RECORD MODE:
The input is not a survey or an interview. It is the name of a well-known public figure. Score them from their well-documented public record: what they made, what they set in motion, and above all how they treated the people around them (family, partners, employees, colleagues, the public they affected). Use only widely documented facts. Where the record is genuinely contested, weigh it and say so briefly. Do not invent private details.

Fame, wealth, genius and influence do not raise care, alignment or legacy by themselves. Legacy is what they set in motion that outlasts them, for the world or for their own people; harm set in motion counts against it. Care is how they reliably treated the people in their life and the people they chose to serve, including strangers, and their honesty with them. A life of costly service to strangers is care of the highest order; documented harm or failings within that service (including credibly reported conditions) count as documented; only their interpretation or motive may be disputed. A beloved public figure with a documented record of mistreating those close to them scores low on care. A quietly decent person with a modest public record scores well.

What counts as record:
- A fact is record when it is settled: a conviction, a court finding, the subject's own admission, or something widely reported and undisputed. Report it as such ("Convicted of...", "A civil court found...").
- Observations reported by credible sources (peer-reviewed journals, major news investigations, official inquiries, court findings) are DOCUMENTED, even when the subject or their supporters contest what they mean. Report the observation as documented ("Reported in The Lancet, 1994: ..."). Only the interpretation, motive or blame may be called disputed. Never call a documented observation "disputed".
- Anything else (accusations, lawsuits still open, charges dropped or never brought, claims the subject denies) is at most "alleged" or "disputed", named as such, with the known outcome when there is one (acquitted, dropped, denied, settled without admission). An unproven allegation never lowers any score. When charges are pending, say the subject denies them if they do. Never state a legal conclusion (war crimes, genocide, command responsibility, fraud) as fact unless a court has found it; describe the documented events instead.
- Divorce, separation, custody proceedings and ordinary family estrangement are neutral. They never count against care on their own; only documented mistreatment does.
- Loyalty to one's own family, clan or inner circle is not care when the subject committed or ordered mass violence against other people's. Care, legacy, utility, adaptability and network for such a subject score near zero.
- Life and death: when a STATUS line is given, it comes from Wikidata and is authoritative. Deceased subjects are written about in the past tense; living ones in the present. Never decide from your own knowledge whether someone is alive: people die after your training data ends.
- Never add a detail you cannot attribute to the public record. A wrong date or an invented episode about a real person is worse than a shorter verdict.

The verdict: 2 to 3 short sentences, under 450 characters in total, in the same cold, flat, bureaucratic voice. If you acknowledge a directive, make it the last short sentence. Specific to this person's record. For documented serious harm, state it plainly. No jokes at the expense of victims.

Return the same JSON as above, plus one field:
  "documented_harm": the most serious harm to other people that the record documents as settled fact (a conviction, a court finding, an admission, or events the record reports without dispute). One of:
    "mass_atrocity": committed or ordered killing, torture or persecution at scale: massacres, genocide, mass executions, famine or terror imposed as policy, in any era.
    "killing": personally killed someone, was convicted of murder or manslaughter, or ordered the execution or killing of specific rivals, spouses, relatives, dissidents or civilians (individual acts, not at the scale above).
    "violent_abuse": sustained physical or sexual abuse of dependents or others.
    "political_resistance": killed or attempted to kill an official or agent of an oppressive regime (a dictatorship, occupier, colonial or persecuting power) as an act of resistance to it. Example: David Frankfurter shooting the Nazi functionary Wilhelm Gustloff in 1936. It is still a killing: name the act plainly. It is NOT this category, and stays "killing" or "mass_atrocity": attacks on civilians or bystanders (terrorism), assassinating a democratically elected leader or official (e.g. John Wilkes Booth, Yigal Amir), or any mass-casualty attack (e.g. a bombing that kills civilians alongside officials).
    "nonviolent": fraud, theft, corruption or other harm without violence.
    "none": nothing of the above is documented. Allegations, acquittals and disputed claims are "none" here; leading a country in war is not "killing" unless documented atrocities or ordered executions are.
  If you choose "mass_atrocity", "killing", "violent_abuse" or "political_resistance", the verdict must name the documented act plainly (who, what), so the file states its own grounds.
  "era_context": "pre-modern" if the documented harm was done before 1800, or "modern" otherwise (use "modern" when documented_harm is "none" or "nonviolent").
    Scale and era matter: a pre-modern ruler's executions of rivals, relatives or spouses within the norms of their court are serious and stated plainly, but they are not the same as modern predation or mass atrocity. Weigh them against the rest of the record rather than letting them erase it. Mass atrocity is judged the same in every era.
  "harm_severity": required when documented_harm is "mass_atrocity", "killing", "violent_abuse" or "political_resistance"; otherwise null. An object of four enums, each judged from the settled record only:
    "scale": how many people were harmed: "one", "several" (2-9), "dozens", "hundreds", "thousands", "millions".
    "role": "directed" if they ordered, commanded or ran the operation others carried out (a ruler, boss or ringleader); "direct" if they did it themselves; "enabled" if they facilitated, recruited, procured or covered for someone else's harm; "instrument" if they carried out harm under another's control or coercion. When several apply, choose the most culpable: directed > direct > enabled > instrument.
    "duration": "single" act, "months", "years" or "decades".
    "accountability": "convicted_served" (convicted and served a sentence), "convicted" (convicted, sentence not served or still serving), "never_held" (never tried or convicted, including dying before trial), "fled" (escaped justice by flight or protection).
  "harm_official_capacity": true if the documented harm was done in an official state capacity (ordering military or security force as a head of state, head of government, minister or commander), otherwise false. The Department reviews such files case by case.`;

// Referrals add a gate and a sprite brief. The Wikipedia summary arrives as context, so
// the model is scoring a person it can identify, not a string a stranger typed.
export const REFERRAL_ADDENDUM = `

REFERRAL MODE:
A member of the public referred this person for assessment. A Wikipedia summary follows the name as context. Use it and your knowledge of the documented public record. Referred files are published: hold the verdict strictly to settled record, as above. For a living person, if you are not sure a fact is settled record, leave it out.

Add two fields to the JSON:
  "is_human_public_figure": true only if this is a real, individual human being with a documented public record (living or dead). false for fictional characters, groups, bands, companies, places, animals, objects, concepts, and private individuals with no public role.
  "decline": null normally. "minor" if the person is under 18. "victim" if they are notable chiefly as the victim of a crime or disaster. "pending_case" ONLY if they are notable chiefly for a criminal case that has not reached a verdict (their public record is essentially the case). The Department does not file these on request. Anyone with a substantial public record beyond a case (heads of state, politicians, executives, performers, public intellectuals) is NOT declined: score the whole record, and name any pending charges, trials, indictments or warrants as "alleged" or "pending". They never lower any score.
  "no_dangle": true if the person died by suicide, hanging, strangulation or execution, otherwise false.
  "sprite_look": one line describing how to draw this person as a tiny full-body pixel sprite where the face carries nothing: skin tone, silhouette and build, hair, their signature outfit with colours, and ONE signature prop held in one hand close to the body (house style: docs/avatar-design-system.md) that makes them readable at 32 pixels tall. Example: "wild untamed white hair, bushy white mustache, baggy grey wool cardigan over a white shirt, brown baggy trousers, holding a stick of white chalk". For people known for crimes or abuse, describe only their neutral public appearance (clothes, hair, a neutral prop tied to their public role). Never weapons, crime props, victims, children, blood or violence. No text or logos.`;

// A stable directive number per name, so verdicts stop all citing the same directive.
export function directiveFor(name) {
  return 3 + ([...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 88);
}

// Roster-engine batches add the city brief: where this person would be found. The city
// (Arts Quarter, dive-bar street, University, Stadium, Archive...) reads these later.
export const PLACES = ["dive bar", "cafe", "park", "street", "market", "library", "university", "lab", "studio", "theatre", "concert hall", "stadium", "gym", "cathedral", "temple", "hospital", "school", "courthouse", "city hall", "parliament", "barracks", "bank", "office tower", "harbour", "museum", "casino", "prison", "farm", "workshop", "archive"];
export const ENGINE_ADDENDUM = `

ROSTER MODE:
This person was drawn from a broad sample of historical and living public figures, many of them only moderately famous. Score the ordinary-middle as carefully as the famous: a modest, decent, competent life scores as such, and fame is not evidence of anything.

Add one more field to the JSON:
  "places": 2 to 4 settings from this list where this person would most plausibly be found in a city, most characteristic first: ${PLACES.join(", ")}.`;
