# Sprite audit, 2026-09-26

153 sprites checked (63 repo, 90 production). **148 pass, 5 fail.** Gate: scripts/sprite_qa.py (design-system sheet checks, head, bare-skin torso, skin-tone band vs face lightness, then a Claude Haiku vision check told the recorded skin tone: one fully clothed full-body person matching the look and skin).

Failures (contact sheet: docs/sprite-audit-failures.png):

| Sprite | Where | Skin (band / face L* / checks) | Reason |
|---|---|---|---|
| adolf-hitler | prod | fair / pixels ok | not a full body with a head; Frame cuts off legs at knee level; Brown jacket with red armband matches description; Dark hair, small mustache visible |
| donald-rumsfeld | prod | fair / pixels ok | not a full body with a head; Figure cut off at lower legs by frame edge; Grey hair, glasses, dark suit and podium match description; Pointer/wand held matches raised pointer detail |
| kanye-west | prod | brown / pixels ok | not a full body with a head; Feet are cropped off at bottom of frame; Cream bomber jacket and black trousers match description; Holds a round record-like object at chest |
| ron-jeremy | prod | medium / pixels ok | not a full body with a head; Feet cut off at bottom of frame; Black shirt and jeans match description; Clapperboard held close to chest as specified |
| william-king-hale | prod | fair / pixels ok | not a full body with a head; Frame cuts off at upper thighs, feet not visible; Wide-brimmed hat, vest and white shirt match description; Holding a brown object resembling a ledger/book close to body |

All results (skin: recorded band from scripts/skin.json / measured face L* / lightness flag / vision verdict):

| Sprite | Where | Skin | Result |
|---|---|---|---|
| aaron-hernandez | repo | olive / pixels ok / vision drawn light brown | pass |
| ada-lovelace | repo | fair / pixels ok / vision drawn fair | pass |
| alan-turing | repo | fair / pixels ok / vision drawn fair | pass |
| albert-einstein | repo | fair / pixels ok / vision drawn fair | pass |
| aretha-franklin | repo | brown / pixels ok / vision drawn brown | pass |
| babe-ruth | repo | fair / pixels ok / vision drawn fair | pass |
| bernie-madoff | repo | fair / pixels ok / vision drawn fair | pass |
| billie-holiday | repo | brown / pixels ok / vision drawn brown | pass |
| bruce-lee | repo | medium / pixels ok / vision drawn medium | pass |
| caligula | repo | medium / pixels ok / vision drawn fair | pass |
| cleopatra | repo | medium / pixels ok / vision drawn brown | pass |
| dennis-rodman | repo | brown / pixels ok / vision drawn brown | pass |
| elizabeth-holmes | repo | very fair / pixels ok / vision drawn fair | pass |
| elon-musk | repo | fair / pixels ok / vision drawn fair | pass |
| genghis-khan | repo | medium / pixels ok / vision drawn medium | pass |
| george-orwell | repo | fair / pixels ok / vision drawn fair | pass |
| ghislaine-maxwell | repo | fair / pixels ok / vision drawn fair | pass |
| grace-hopper | repo | fair / pixels ok / vision drawn fair | pass |
| harriet-tubman | repo | brown / pixels ok / vision drawn dark brown | pass |
| harvey-weinstein | repo | fair / pixels ok / vision drawn fair | pass |
| henry-viii | repo | fair / pixels ok / vision drawn fair | pass |
| isaac-newton | repo | fair / pixels ok / vision drawn fair | pass |
| jason-kelce | repo | fair / pixels ok / vision drawn fair | pass |
| jeffrey-epstein | repo | fair / pixels ok / vision drawn fair | pass |
| jfk | repo | fair / pixels ok / vision drawn fair | pass |
| joe-jackson | repo | brown / pixels ok / vision drawn dark brown | pass |
| keanu-reeves | repo | fair / pixels ok / vision drawn fair | pass |
| kim-jong-un | repo | fair / pixels ok / vision drawn fair | pass |
| kobe-bryant | repo | brown / pixels ok / vision drawn dark brown | pass |
| leonardo-da-vinci | repo | fair / pixels ok / vision drawn fair | pass |
| madonna | repo | fair / pixels ok / vision drawn fair | pass |
| mahatma-gandhi | repo | light brown / pixels ok / vision drawn brown | pass |
| mansa-musa | repo | dark brown / pixels ok / vision drawn dark brown | pass |
| mao-zedong | repo | medium / pixels ok / vision drawn fair | pass |
| marcus-aurelius | repo | medium / pixels ok / vision drawn fair | pass |
| marie-curie | repo | fair / pixels ok / vision drawn fair | pass |
| martin-luther-king-jr | repo | brown / pixels ok / vision drawn brown | pass |
| martin-shkreli | repo | fair / pixels ok / vision drawn fair | pass |
| michael-jackson | repo | medium / pixels ok / vision drawn medium | pass |
| mother-teresa | repo | fair / pixels ok / vision drawn fair | pass |
| muhammad-ali | repo | brown / pixels ok / vision drawn dark brown | pass |
| nelson-mandela | repo | brown / pixels ok / vision drawn dark brown | pass |
| nikola-jokic | repo | fair / pixels ok / vision drawn fair | pass |
| nikola-tesla | repo | fair / pixels ok / vision drawn fair | pass |
| oj-simpson | repo | brown / pixels ok / vision drawn dark brown | pass |
| oprah-winfrey | repo | brown / pixels ok / vision drawn brown | pass |
| pablo-escobar | repo | medium / pixels ok / vision drawn light brown | pass |
| pablo-picasso | repo | olive / pixels ok / vision drawn fair | pass |
| pel | repo | brown / pixels ok / vision drawn brown | pass |
| peter-thiel | repo | fair / pixels ok / vision drawn fair | pass |
| prince | repo | light brown / pixels ok / vision drawn medium | pass |
| princess-diana | repo | fair / pixels ok / vision drawn fair | pass |
| putin | repo | fair / pixels ok / vision drawn fair | pass |
| queen-elizabeth-ii | repo | fair / pixels ok / vision drawn fair | pass |
| ronaldinho | repo | brown / pixels ok / vision drawn brown | pass |
| sam-altman | repo | fair / pixels ok / vision drawn fair | pass |
| scott | repo | fair / pixels ok / vision drawn fair | pass |
| shohei-ohtani | repo | medium / pixels ok / vision drawn light brown | pass |
| socrates | repo | medium / pixels ok / vision drawn fair | pass |
| stephen-hawking | repo | fair / pixels ok / vision drawn fair | pass |
| taylor-swift | repo | fair / pixels ok / vision drawn fair | pass |
| tom-brady | repo | fair / pixels ok / vision drawn fair | pass |
| winston-churchill | repo | fair / pixels ok / vision drawn fair | pass |
| abraham-lincoln | prod | fair / pixels ok / vision drawn fair | pass |
| adolf-hitler | prod | fair / pixels ok | FAIL |
| albert-tomas | prod | medium / pixels ok / vision drawn fair | pass |
| anatoly-onoprienko | prod | fair / pixels ok / vision drawn fair | pass |
| andre-the-giant | prod | fair / pixels ok / vision drawn fair | pass |
| andrew-callaghan | prod | fair / pixels ok / vision drawn fair | pass |
| armie-hammer | prod | fair / pixels ok / vision drawn fair | pass |
| arthur-ashe | prod | brown / pixels ok / vision drawn brown | pass |
| bam-margera | prod | fair / pixels ok / vision drawn fair | pass |
| barack-obama | prod | brown / pixels ok / vision drawn medium | pass |
| bashar-al-assad | prod | fair / pixels ok / vision drawn fair | pass |
| benjamin-netanyahu | prod | fair / pixels ok / vision drawn fair | pass |
| bill-clinton | prod | fair / pixels ok / vision drawn fair | pass |
| bob-dylan | prod | fair / pixels ok / vision drawn fair | pass |
| boris-cherny | prod | fair / pixels ok / vision drawn medium | pass |
| boris-johnson | prod | fair / pixels ok / vision drawn fair | pass |
| charles-iv-of-spain | prod | fair / pixels ok / vision drawn fair | pass |
| david-frankfurter | prod | fair / pixels ok / vision drawn fair | pass |
| david-miscavige | prod | fair / pixels ok / vision drawn fair | pass |
| david-rene-de-rothschild | prod | fair / pixels ok / vision drawn fair | pass |
| dolly-parton | prod | fair / pixels ok / vision drawn fair | pass |
| donald-rumsfeld | prod | fair / pixels ok | FAIL |
| donald-trump | prod | fair / pixels ok / vision drawn medium | pass |
| du-yuesheng | prod | medium / pixels ok / vision drawn fair | pass |
| ellen-church | prod | fair / pixels ok / vision drawn fair | pass |
| ferdinando-petruccelli-della-gattina | prod | fair / pixels ok / vision drawn fair | pass |
| george-washington | prod | fair / pixels ok / vision drawn fair | pass |
| giordano-bruno | prod | medium / pixels ok / vision drawn fair | pass |
| hasan-al-askari | prod | medium / pixels ok / vision drawn medium | pass |
| henry-kissinger | prod | fair / pixels ok / vision drawn fair | pass |
| ho-chi-minh | prod | medium / pixels ok / vision drawn fair | pass |
| j-edgar-hoover | prod | fair / pixels ok / vision drawn fair | pass |
| j-robert-oppenheimer | prod | fair / pixels ok / vision drawn fair | pass |
| jack-johnson | prod | dark brown / pixels ok / vision drawn dark brown | pass |
| jan-hus | prod | fair / pixels ok / vision drawn fair | pass |
| jared-kushner | prod | fair / pixels ok / vision drawn fair | pass |
| jesus | prod | olive / pixels ok / vision drawn olive | pass |
| jim-carrey | prod | fair / pixels ok / vision drawn fair | pass |
| jim-cramer | prod | fair / pixels ok / vision drawn medium | pass |
| jimmy-carter | prod | fair / pixels ok / vision drawn fair | pass |
| joan-of-arc | prod | fair / pixels ok / vision drawn fair | pass |
| joe-biden | prod | fair / pixels ok / vision drawn fair | pass |
| joe-maloy | prod | medium / pixels ok / vision drawn medium | pass |
| johann-bayer | prod | fair / pixels ok / vision drawn fair | pass |
| john-d-rockefeller | prod | fair / pixels ok / vision drawn very fair | pass |
| john-stagliano | prod | fair / pixels ok / vision drawn medium | pass |
| joseph-stalin | prod | fair / pixels ok / vision drawn fair | pass |
| kaahumanu | prod | brown / pixels ok / vision drawn medium | pass |
| kanye-west | prod | brown / pixels ok | FAIL |
| ken-burns | prod | fair / pixels ok / vision drawn fair | pass |
| kendrick-lamar | prod | brown / pixels ok / vision drawn brown | pass |
| kim-kardashian | prod | olive / pixels ok / vision drawn medium | pass |
| laozi | prod | medium / pixels ok / vision drawn fair | pass |
| larry-ellison | prod | fair / pixels ok / vision drawn fair | pass |
| larry-silverstein | prod | fair / pixels ok / vision drawn fair | pass |
| lebron-james | prod | brown / pixels ok / vision drawn dark brown | pass |
| louis-ck | prod | fair / pixels ok / vision drawn fair | pass |
| magic-johnson | prod | dark brown / pixels ok / vision drawn brown | pass |
| marie-antoinette | prod | very fair / pixels ok / vision drawn very fair | pass |
| menachem-mendel-schneerson | prod | fair / pixels ok / vision drawn fair | pass |
| michael-jordan | prod | brown / pixels ok / vision drawn brown | pass |
| muammar-gaddafi | prod | medium / pixels ok / vision drawn olive | pass |
| muhammad | prod | light brown / pixels ok / vision drawn olive | pass |
| neil-degrasse-tyson | prod | brown / pixels ok / vision drawn brown | pass |
| onufriy-berezovsky | prod | fair / pixels ok / vision drawn fair | pass |
| osama-bin-laden | prod | medium / pixels ok / vision drawn medium | pass |
| pedro-garcia-aguado | prod | fair / pixels ok / vision drawn fair | pass |
| pope-john-ii | prod | medium / pixels ok / vision drawn fair | pass |
| richard-nixon | prod | fair / pixels ok / vision drawn fair | pass |
| rick-rubin | prod | fair / pixels ok / vision drawn light brown | pass |
| ron-jeremy | prod | medium / pixels ok | FAIL |
| rupert-murdoch | prod | fair / pixels ok / vision drawn fair | pass |
| saddam-hussein | prod | medium / pixels ok / vision drawn olive | pass |
| sean-combs | prod | brown / pixels ok / vision drawn brown | pass |
| shinzo-abe | prod | medium / pixels ok / vision drawn fair | pass |
| slobodan-milosevic | prod | fair / pixels ok / vision drawn fair | pass |
| stanley-kubrick | prod | fair / pixels ok / vision drawn fair | pass |
| sun-tzu | prod | medium / pixels ok / vision drawn light brown | pass |
| suzanne-lenglen | prod | fair / pixels ok / vision drawn fair | pass |
| terence-mckenna | prod | fair / pixels ok / vision drawn fair | pass |
| the-notorious-big | prod | dark brown / pixels ok / vision drawn brown | pass |
| thomas-jefferson | prod | fair / pixels ok / vision drawn fair | pass |
| tony-blair | prod | fair / pixels ok / vision drawn fair | pass |
| tony-hawk | prod | fair / pixels ok / vision drawn light brown | pass |
| travis-kelce | prod | fair / pixels ok / vision drawn fair | pass |
| tupac-shakur | prod | brown / pixels ok / vision drawn brown | pass |
| vasily-blokhin | prod | fair / pixels ok / vision drawn fair | pass |
| vasily-zaitsev | prod | fair / pixels ok / vision drawn fair | pass |
| vladimir-lenin | prod | fair / pixels ok / vision drawn fair | pass |
| william-king-hale | prod | fair / pixels ok | FAIL |

## Actions taken 2026-09-26

**Redrawn through the gate (recorded skin tone in the prompt; passed pixel + vision checks):**

| Sprite | Where | Was | Now |
|---|---|---|---|
| martin-luther-king-jr | repo | drawn light-skinned (restored to old sprite as a stopgap) | brown skin, charcoal suit, hand raised |
| abraham-lincoln | prod | drawn dark-skinned (quarantined) | fair skin, stovepipe, chin-curtain beard |
| aretha-franklin | repo | drawn light peach | dark brown skin, purple gown, microphone |
| kim-kardashian | prod | two figures, skin-toned dress keyed out (read unclothed) | one figure, black high-neck dress (attempt 2) |
| david-miscavige | prod | two figures | one figure, navy suit (attempt 3; attempts 1-2 drawn too dark) |
| travis-kelce | prod | blocky, headless, wrong colours | red Chiefs #87, football |
| joseph-stalin | prod | grey statue-like face | fair skin, khaki tunic |
| andre-the-giant | prod | drawn brown-skinned | fair skin, plaid shirt, beard |
| bashar-al-assad | prod | yellow-olive face | fair skin, navy suit |

**Quarantined (placeholder shown) pending a gated redraw; the credit budget (25) ran out:**

| Sprite | Why |
|---|---|
| dario-amodei | yellow-olive face |
| malcolm-x | drawn with light peach skin |
| jack-broughton | bare-chested, read as unclothed |
| robert-maxwell | two figures in one sprite |
| adolf-hitler, donald-rumsfeld, kanye-west, ron-jeremy, william-king-hale | old big-head style, failed the full-body vision check |

Redraw them with: `python3 scripts/redraw_gated.py --budget 30 dario-amodei malcolm-x jack-broughton=... robert-maxwell ...`
(each through the full gate; ~2 credits per attempt).
