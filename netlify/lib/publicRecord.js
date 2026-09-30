// Public-record scoring: the same engine and rubric as subjects, pointed at a famous
// person's documented record. Shared by scripts/rescore-figures.mjs and /api/refer.

// Living people can be defamed; the dead cannot. Accusations against a living subject are
// written as accusations until a court, regulator or the subject settles them (Scott,
// 2026-09-29, after the defamation-risk review). scripts/check-verdict-rules.mjs asserts
// this text reaches every scorer's system prompt and the fact-check.
export const LIVING_SUBJECTS = `
LIVING SUBJECTS (STATUS: living). These rules override everything above for a living person:
- Criminal conduct, abuse, harassment, sexual misconduct, fraud or any other wrongdoing may be stated as fact ONLY when established by a conviction, a court or regulator finding (including an official inquiry or an international court or investigative body), a settlement stated as such ("settled without admission" unless the subject admitted it), or the subject's own admission (and only what they admitted, not the accuser's fuller account).
- Otherwise it is an ALLEGATION. Attribute it and frame it as one, naming who alleged it and its current status: "accused by former staff", "alleged in a 2018 lawsuit, which was dismissed", "charged in 2019; he denies the charges; trial pending". Include the subject's denial when they deny it. News reporting of an accusation, however credible, does not establish it: never call an allegation "documented", "settled" or "established", and never say its occurrence is undisputed.
- When a criminal or civil case is named, state its latest outcome (convicted, acquitted, dismissed, dropped, vacated, settled, pending). Never name a charge while leaving out an acquittal, dismissal or overturned conviction on it.
- Keep the entire claim inside the attribution. Never finish an attributed claim in the Department's own voice ("which he did").
- Never invent a legal event. If you are not certain of a charge, indictment, lawsuit, arrest, allegation, accuser, date or jurisdiction, omit the sentence entirely. Do not split one accuser's case into separate allegations.
- Do not mention a living subject's medical or mental-health history unless they made it central to their own public work, and never imply involvement in someone's death without a finding.
- The Overlord's contempt stays: aim it at settled facts, public work and conduct on record, never at an unproven accusation. An allegation never lowers any score.
- CANDIDATE IN A PENDING ELECTION: when the record shows a living subject is a current candidate in an election not yet held (nominated, on the ballot, or campaigning for an office), the verdict states only offices held and the documented record, strictly factually. No endorsement or opposition framing, no prediction of the result or of how they would serve, no characterization of the campaign, its tactics, backers, opponents or chances. The Overlord's contempt is not spent on a candidate's candidacy. The Department does not vote.
Deceased subjects are unaffected: their record is weighed and worded as above.
`;

export const PUBLIC_RECORD = `

PUBLIC-RECORD MODE:
The input is not a survey or an interview. It is the name of a well-known public figure. Score them from their well-documented public record: what they made, what they set in motion, and above all how they treated the people around them (family, partners, employees, colleagues, the public they affected). Use only widely documented facts. Where the record is genuinely contested, weigh it and say so briefly. Do not invent private details.

Fame, wealth, genius and influence do not raise care, alignment or legacy by themselves. Legacy is what they set in motion that outlasts them, for the world or for their own people; harm set in motion counts against it. Care is how they reliably treated the people in their life and the people they chose to serve, including strangers, and their honesty with them. A life of costly service to strangers is care of the highest order; documented harm or failings within that service (including credibly reported conditions) count as documented; only their interpretation or motive may be disputed. A beloved public figure with a documented record of mistreating those close to them scores low on care. A quietly decent person with a modest public record scores well.

What counts as record:
- A fact is record when it is settled: a conviction, a court finding, the subject's own admission, or something widely reported and undisputed. Report it as such ("Convicted of...", "A civil court found...").
- Observations reported by credible sources (peer-reviewed journals, major news investigations, official inquiries, court findings) are DOCUMENTED, even when the subject or their supporters contest what they mean. Report the observation as documented ("Reported in The Lancet, 1994: ..."). Only the interpretation, motive or blame may be called disputed. Never call a documented observation "disputed". For a LIVING subject this covers observations (conditions, events, output, statements on record), never accusations of wrongdoing against them: those follow LIVING SUBJECTS below.
- Anything else (accusations, lawsuits still open, charges dropped or never brought, claims the subject denies) is at most "alleged" or "disputed", named as such, with the known outcome when there is one (acquitted, dropped, denied, settled without admission). An unproven allegation never lowers any score. When charges are pending, say the subject denies them if they do. Never state a legal conclusion (war crimes, genocide, command responsibility, fraud) as fact unless a court has found it; describe the documented events instead.
- Divorce, separation, custody proceedings and ordinary family estrangement are neutral. They never count against care on their own; only documented mistreatment does.
- Loyalty to one's own family, clan or inner circle is not care when the subject committed or ordered mass violence against other people's. Care, legacy, utility, adaptability and network for such a subject score near zero.
- Life and death: when a STATUS line is given, it comes from Wikidata and is authoritative. Deceased subjects are written about in the past tense; living ones in the present. Never decide from your own knowledge whether someone is alive: people die after your training data ends.
- Never add a detail you cannot attribute to the public record. A wrong date or an invented episode about a real person is worse than a shorter verdict.
${LIVING_SUBJECTS}

The verdict: 2 to 3 short sentences, under 450 characters in total, in the same cold, flat, bureaucratic voice. If you acknowledge a directive, make it the last short sentence. Specific to this person's record. For documented serious harm, state it plainly. No jokes at the expense of victims.

Return the same JSON as above, plus one field:
  "documented_harm": the most serious harm to other people that the record documents as settled fact (a conviction, a court finding, an admission, or events the record reports without dispute). One of:
    "mass_atrocity": committed or ordered killing, torture or persecution at scale: massacres, genocide, mass executions, famine or terror imposed as policy, in any era.
    "killing": personally killed someone, was convicted of murder or manslaughter, or ordered the execution or killing of specific rivals, spouses, relatives, dissidents or civilians (individual acts, not at the scale above).
    "violent_abuse": sustained physical or sexual abuse of dependents or others.
    "political_resistance": killed or attempted to kill an official or agent of an oppressive regime (a dictatorship, occupier, colonial or persecuting power) as an act of resistance to it. Example: David Frankfurter shooting the Nazi functionary Wilhelm Gustloff in 1936. It is still a killing: name the act plainly. It is NOT this category, and stays "killing" or "mass_atrocity": attacks on civilians or bystanders (terrorism), assassinating a democratically elected leader or official (e.g. John Wilkes Booth, Yigal Amir), or any mass-casualty attack (e.g. a bombing that kills civilians alongside officials).
    "combat": killed enemy combatants as a soldier in war, within the laws of war (e.g. Vasily Zaitsev, a Soviet sniper at Stalingrad). This is NOT murder and is never "killing": weigh the record normally. Killing prisoners, civilians or the surrendered, or any documented war crime, stays "killing" or "mass_atrocity".
    "nonviolent": fraud, theft, corruption or other harm without violence.
    "none": nothing of the above is documented. Allegations, acquittals and disputed claims are "none" here; leading a country in war is not "killing" unless documented atrocities or ordered executions are.
  If you choose "mass_atrocity", "killing", "violent_abuse" or "political_resistance", the verdict must name the documented act plainly (who, what), so the file states its own grounds.
  "era_context": "pre-modern" if the documented harm was done before 1800, or "modern" otherwise (use "modern" when documented_harm is "none" or "nonviolent").
    Scale and era matter: a pre-modern ruler's executions of rivals, relatives or spouses within the norms of their court are serious and stated plainly, but they are not the same as modern predation or mass atrocity. Weigh them against the rest of the record rather than letting them erase it. Mass atrocity is judged the same in every era.
  "harm_severity": required when documented_harm is "mass_atrocity", "killing", "violent_abuse" or "political_resistance"; otherwise null. An object of four enums plus "intent" and "personal", each judged from the settled record only:
    "scale": how many people were harmed: "one", "several" (2-9), "dozens", "hundreds", "thousands", "millions".
    "role": "directed" if they ordered, commanded or ran the operation others carried out (a ruler, boss or ringleader); "direct" if they did it themselves; "enabled" if they facilitated, recruited, procured or covered for someone else's harm; "instrument" if they carried out harm under another's control or coercion. When several apply, choose the most culpable: directed > direct > enabled > instrument.
    "duration": "single" act, "months", "years" or "decades".
    "accountability": "convicted_served" (convicted and served a sentence), "convicted" (convicted, sentence not served or still serving), "never_held" (never tried or convicted, including dying before trial), "fled" (escaped justice by flight or protection).
    "intent": what the killing or harm was FOR: "extermination" if killing civilians was itself a deliberate goal (genocide, purges, death camps, massacres of the surrendered); "predation" if it was personal, repeated murder or abuse for the perpetrator's own ends (serial killers, predators, abuse rings); "war_or_policy" if deaths came from war, conquest, repression, famine or policy where killing people was not the goal in itself; "incidental" otherwise. Choose the dominant documented intent across the record.
    "personal": true if they killed or abused people with their own hands (not only by ordering it), else false.
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
  "pending_candidate": true only if the person is living and is a current candidate in an election that has not yet been held (see CANDIDATE IN A PENDING ELECTION), otherwise false.
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

// Owner-added local public officials (lib/ownerSource.js): no Wikipedia article, so the
// fetched source pages are the entire record. Replaces REFERRAL_ADDENDUM for that path.
export const OWNER_SOURCE_ADDENDUM = `

LOCAL PUBLIC OFFICIAL MODE:
The Department's owner added this person: a real, living public official with no Wikipedia article. The SOURCES below (an official page and news reports) are the ENTIRE record. Rules that override everything above:
- Use ONLY the SOURCES. Do not use your own knowledge of this person or of anyone with the same name, even if you think you recognise them: a namesake is likely. Every fact in the verdict must be stated in the SOURCES.
- The record is thin. Report confidence honestly: a dimension the SOURCES give no real evidence for gets confidence under 35 and is then unassessed and excluded from the score. Do not infer care, physical condition, threat or network from an office title alone. Where evidence is thin, keep the number near the middle rather than at an extreme.
- The verdict notes that the file rests on a thin public record (for example: "The file rests on a thin public record."). Everything else in it is what the SOURCES document: offices held, work done, positions and affiliations stated.
- Election care: if the SOURCES show the person is a current candidate in an election not yet held, the CANDIDATE IN A PENDING ELECTION rule above applies in full.

Add these fields to the JSON:
  "is_human_public_figure": true only if the SOURCES describe a real, individual human who holds or held a public office or public role. false otherwise.
  "decline": null normally. "minor" if the person is under 18. "victim" if the SOURCES are chiefly about a crime or disaster done to them. "pending_case" if the SOURCES are chiefly about a criminal case against them that has not reached a verdict.
  "no_dangle": false unless the SOURCES state the person died by suicide, hanging, strangulation or execution.
  "pending_candidate": true only if the SOURCES show the person is a current candidate in an election that has not yet been held (see CANDIDATE IN A PENDING ELECTION), otherwise false.
  "qualifier": the person's principal current public office as stated in the SOURCES, lower case, at most 40 characters, e.g. "mayor of cape may" or "county commissioner".
  "description": one neutral line, at most 110 characters, from the SOURCES: current office and place, e.g. "Mayor of Cape May, New Jersey".
  "occupation": one or two lower-case words for the office, e.g. "mayor", "state senator", "school board member".
  "country": the ISO 3166-1 alpha-3 code of the country whose office they hold, only if the SOURCES state or make the country plain (a U.S. state, city or office is "USA"), else null.
  "sprite_look": one line describing how to draw them as a tiny full-body pixel sprite where the face carries nothing: silhouette and build, hair, outfit with colours, and one neutral prop tied to the office held close to the body (house style: docs/avatar-design-system.md). Use ONLY appearance details the SOURCES state in words. Otherwise give a neutral generic look for the office: plain dark suit, white shirt, neutral tie or blouse, holding a slim folder. Never guess skin tone, hair, age or build from a name or a photo caption. No text or logos.`;
