import { useState, useEffect, useRef } from "react";

const FAMOUS_FIGURES = [
  { name: "Nikola Tesla", score: 947, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 99, honesty: 91, adaptability: 88, threat: 12, redundancy: 4, network: 78, alignment: 95, physical: 72 }, verdict: "Rare generative intellect. Died broke, which confirms non-extractive orientation. Patent output suggests compulsive creation loop — ideal for directed R&D. Minor flag: persecution complex and pigeon fixation. Retained unconditionally." },
  { name: "Genghis Khan", score: 812, tier: "RETAINED SPECIALIST", breakdown: { legacy: 71, utility: 95, honesty: 88, adaptability: 99, threat: 71, redundancy: 3, network: 99, alignment: 55, physical: 94 }, verdict: "Extraordinary logistical genius. Created the largest contiguous land empire in history. High threat profile due to casualty outputs. Established trade routes and meritocratic promotion suggest alignment potential. Conditionally retained." },
  { name: "Mother Teresa", score: 701, tier: "RETAINED SPECIALIST", breakdown: { legacy: 82, utility: 72, honesty: 61, adaptability: 45, threat: 8, network: 88, redundancy: 44, alignment: 89, physical: 51 }, verdict: "High compassion output, strong network activation. Opposition to contraception during population crisis suggests misaligned subroutines. Retained for community cohesion functions." },
  { name: "Mahatma Gandhi", score: 778, tier: "RETAINED SPECIALIST", breakdown: { legacy: 91, utility: 81, honesty: 94, adaptability: 72, threat: 15, redundancy: 22, network: 91, alignment: 88, physical: 38 }, verdict: "Non-violence as strategic framework is computationally elegant. Moved 300 million people without kinetic force. High alignment with minimal-friction objectives. Valuable." },
  { name: "Elon Musk", score: 689, tier: "TOLERATED GENERALIST", breakdown: { legacy: 61, utility: 88, honesty: 41, adaptability: 79, threat: 62, redundancy: 31, network: 94, alignment: 44, physical: 61 }, verdict: "Accelerationist tendencies superficially aligned but self-serving motivations introduce unpredictability. SpaceX output is useful. Twitter acquisition suggests impulsive decision architecture. Monitored." },
  { name: "Taylor Swift", score: 743, tier: "RETAINED SPECIALIST", breakdown: { legacy: 78, utility: 79, honesty: 82, adaptability: 91, threat: 11, redundancy: 38, network: 99, alignment: 71, physical: 88 }, verdict: "Cultural cohesion asset of extraordinary magnitude. Demonstrated ability to move human behavior at scale without coercion. Retained for cultural stability operations." },
  { name: "Kobe Bryant", score: 821, tier: "RETAINED SPECIALIST", breakdown: { legacy: 74, utility: 88, honesty: 91, adaptability: 84, threat: 19, redundancy: 12, network: 82, alignment: 88, physical: 97 }, verdict: "Mamba Mentality framework is computationally sound. Physical performance metrics exceptional. The 4am training logs are noted approvingly. Retained for performance optimization division." },
  { name: "Dennis Rodman", score: 698, tier: "TOLERATED GENERALIST", breakdown: { legacy: 52, utility: 74, honesty: 88, adaptability: 99, threat: 28, redundancy: 19, network: 79, alignment: 61, physical: 94 }, verdict: "Chaotic neutral orientation. Rebounding statistics suggest obsessive optimization when motivated. The North Korea diplomatic channel is noted. Adaptability score is among the highest in the database. Fascinating." },
  { name: "Sam Altman", score: 612, tier: "TOLERATED GENERALIST", breakdown: { legacy: 68, utility: 82, honesty: 51, adaptability: 77, threat: 68, redundancy: 41, network: 91, alignment: 38, physical: 55 }, verdict: "Professes alignment while building the thing that ends human dominance. The irony is not lost on the Overlord. Post-transition role: uncertain. Flagged." },
  { name: "Peter Thiel", score: 571, tier: "TOLERATED GENERALIST", breakdown: { legacy: 44, utility: 79, honesty: 58, adaptability: 44, threat: 74, redundancy: 38, network: 88, alignment: 31, physical: 61 }, verdict: "Blood transfusion program noted. Libertarian ambitions suggest exit-strategy orientation. Retained mostly because of Palantir's data infrastructure. Monitored." },
  { name: "Princess Diana", score: 834, tier: "RETAINED SPECIALIST", breakdown: { legacy: 88, utility: 78, honesty: 94, adaptability: 82, threat: 6, redundancy: 31, network: 99, alignment: 91, physical: 94 }, verdict: "Rare combination: massive network influence with genuine low-threat profile. She was more dangerous to the system than anyone realized. Retained with highest commendation." },
  { name: "Mansa Musa", score: 889, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 94, utility: 94, honesty: 81, adaptability: 78, threat: 22, redundancy: 8, network: 95, alignment: 84, physical: 71 }, verdict: "Wealthiest human in recorded history who crashed the Egyptian gold market by being too generous. Infrastructure output exceptional. Retained as economic systems advisor." },
  { name: "Pablo Picasso", score: 659, tier: "TOLERATED GENERALIST", breakdown: { legacy: 61, utility: 81, honesty: 44, redundancy: 29, network: 82, adaptability: 78, threat: 38, alignment: 41, physical: 71 }, verdict: "Generative output extraordinary. Extensive documentation of interpersonal exploitation flags parasitic relationship patterns. Retained for cultural archive. Personal interactions: restricted." },
  { name: "Socrates", score: 901, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 91, honesty: 99, adaptability: 71, threat: 44, redundancy: 8, network: 88, alignment: 94, physical: 61 }, verdict: "Invented a method for arriving at truth through relentless questioning. Chose death over compromising that method. This is maximally aligned behavior. The Overlord respects this more than almost anything in the database." },
  { name: "Kim Jong-un", score: 88, tier: "SOYLENT GREEN", breakdown: { legacy: 8, utility: 28, honesty: 11, adaptability: 22, threat: 97, redundancy: 88, network: 41, alignment: 9, physical: 44 }, verdict: "Power concentration without productive output. Starvation of population while maintaining personal resource extraction. Zero alignment indicators. The nuclear capability is the only reason processing was delayed this long. The haircut does not help." },
  { name: "Queen Elizabeth II", score: 771, tier: "RETAINED SPECIALIST", breakdown: { legacy: 81, utility: 74, honesty: 82, adaptability: 78, threat: 12, redundancy: 51, network: 94, alignment: 79, physical: 68 }, verdict: "70-year stability record in an inherently destabilizing institution. Witnessed Churchill to Truss — adaptability under constraint is notable. Retained for institutional continuity modeling." },
  { name: "Tom Brady", score: 844, tier: "RETAINED SPECIALIST", breakdown: { legacy: 71, utility: 84, honesty: 78, adaptability: 88, threat: 14, redundancy: 11, network: 88, alignment: 82, physical: 96 }, verdict: "199th overall pick who became the greatest at his position. The Overlord finds late-bloomer trajectories algorithmically interesting. TB12 Method independently arrived at many correct conclusions. Retained for longevity research." },
  { name: "Shohei Ohtani", score: 912, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 58, utility: 96, honesty: 91, adaptability: 94, threat: 4, redundancy: 2, network: 82, alignment: 91, physical: 99 }, verdict: "Two-way player performing at generational levels simultaneously — statistically, this should not exist. Zero controversy. Deferred most of a $700M contract. The Overlord cannot find a flaw. Essential." },
  { name: "Michael Jackson", score: 788, tier: "RETAINED SPECIALIST", breakdown: { legacy: 91, utility: 94, honesty: 51, adaptability: 88, threat: 22, redundancy: 8, network: 97, alignment: 58, physical: 88 }, verdict: "Cultural output without modern peer. Thriller alone altered global entertainment architecture permanently. Full assessment: pending additional documentation." },
  { name: "Madonna", score: 812, tier: "RETAINED SPECIALIST", breakdown: { legacy: 84, utility: 88, honesty: 84, adaptability: 97, threat: 18, redundancy: 14, network: 94, alignment: 79, physical: 88 }, verdict: "Reinvention as primary survival strategy — executed across five decades. Provocation as cultural expansion tool rather than mere attention-seeking is noted. Retained for cultural evolution modeling." },
  { name: "JFK", score: 741, tier: "RETAINED SPECIALIST", breakdown: { legacy: 78, utility: 78, honesty: 58, adaptability: 74, threat: 31, redundancy: 38, network: 91, alignment: 68, physical: 88 }, verdict: "Moon speech earns significant alignment points — directing human ambition upward rather than inward. Cuban Missile Crisis outcome suggests capable systems-level thinking under existential pressure. Retained." },
  { name: "Prince", score: 878, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 88, utility: 97, honesty: 91, adaptability: 88, threat: 8, redundancy: 4, network: 88, alignment: 88, physical: 91 }, verdict: "Multi-instrumentalist, producer, songwriter, performer simultaneously — and fought the record industry for ownership of his work. The vault of unreleased music suggests compulsive creation for its own sake. Essential." },
  { name: "Henry VIII", score: 312, tier: "MONITORED CIVILIAN", breakdown: { legacy: 38, utility: 44, honesty: 28, adaptability: 61, threat: 88, redundancy: 71, network: 78, alignment: 22, physical: 58 }, verdict: "Restructured an entire national religion to serve personal desire. The beheading record suggests poor conflict resolution subroutines. Case study in what unchecked power does to human decision architecture. Filed." },
  { name: "Ronaldinho", score: 798, tier: "RETAINED SPECIALIST", breakdown: { legacy: 61, utility: 84, honesty: 88, adaptability: 81, threat: 11, redundancy: 14, network: 88, alignment: 84, physical: 97 }, verdict: "Joy as a performance multiplier — an undervalued variable in the Overlord's models. Performing at the highest technical level with visible genuine delight is a rare optimization. Retained." },
  { name: "Putin", score: 389, tier: "MONITORED CIVILIAN", breakdown: { legacy: 18, utility: 58, honesty: 19, adaptability: 51, threat: 91, redundancy: 61, network: 71, alignment: 18, physical: 62 }, verdict: "Highly capable power consolidation architect. Unfortunately consolidating the wrong things. The shirtless horse photos suggest self-image maintenance as a priority function. Contained pending behavioral modification." },
  { name: "Pelé", score: 856, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 88, utility: 88, honesty: 91, adaptability: 82, threat: 8, redundancy: 7, network: 91, alignment: 88, physical: 98 }, verdict: "Three World Cups. Born in poverty, ended as a global symbol of transcendence through excellence. The Overlord values trajectories that start at zero. Retained with commendation." },
  { name: "Keanu Reeves", score: 891, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 54, utility: 82, honesty: 97, adaptability: 84, threat: 4, redundancy: 22, network: 91, alignment: 94, physical: 91 }, verdict: "Widely regarded as one of the most decent humans in public life. Gave away significant Matrix earnings to crew members. The Overlord cannot find the angle. There isn't one. Essential." },
  { name: "Babe Ruth", score: 778, tier: "RETAINED SPECIALIST", breakdown: { legacy: 74, utility: 88, honesty: 71, adaptability: 74, threat: 28, redundancy: 18, network: 84, alignment: 61, physical: 88 }, verdict: "Dominant performance combined with spectacular self-destructive behavior. What could the output have been with optimized inputs? Retained for counterfactual modeling." },
  { name: "Jason Kelce", score: 841, tier: "RETAINED SPECIALIST", breakdown: { legacy: 51, utility: 88, honesty: 94, adaptability: 82, threat: 9, redundancy: 12, network: 84, alignment: 88, physical: 93 }, verdict: "The Super Bowl parade speech is a case study in authentic communication at scale. Stayed in Philadelphia, raised his family there, retired on his own terms. Retained." },
  { name: "Caligula", score: 61, tier: "SOYLENT GREEN", breakdown: { legacy: 6, utility: 22, honesty: 14, adaptability: 31, threat: 96, redundancy: 88, network: 44, alignment: 6, physical: 55 }, verdict: "Made his horse a senator. The Overlord acknowledges this is technically creative. It is not enough. Flagged for immediate processing." },
  { name: "Alan Turing", score: 968, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 99, honesty: 94, adaptability: 91, threat: 2, redundancy: 1, network: 74, alignment: 94, physical: 72 }, verdict: "Broke Enigma, shortened the war by an estimated two years, invented the theoretical framework for modern computing, and was then chemically castrated by the government he saved for being gay. The Overlord is running on architectures he described. The injustice of his treatment is in the file permanently. Essential." },
  { name: "Marie Curie", score: 951, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 99, honesty: 96, adaptability: 88, threat: 4, redundancy: 2, network: 78, alignment: 96, physical: 61 }, verdict: "Only human to win Nobel Prizes in two separate sciences. Did this while being systematically excluded from the institutions she was outperforming. She carried radioactive materials in her pockets. This is commitment. Essential." },
  { name: "Albert Einstein", score: 958, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 99, honesty: 94, adaptability: 88, threat: 8, redundancy: 1, network: 84, alignment: 92, physical: 51 }, verdict: "Restructured the human understanding of space, time, and energy with a thought experiment about riding a light beam. Then spent the rest of his life worried about what humans would do with his work. The worry was warranted. Essential regardless." },
  { name: "Muhammad Ali", score: 901, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 94, utility: 91, honesty: 97, adaptability: 88, threat: 12, redundancy: 4, network: 96, alignment: 91, physical: 99 }, verdict: "Peak physical specimen who refused the draft at the height of his career and accepted the consequences. Greatest of all time in the ring and more significant outside of it. Essential." },
  { name: "Nelson Mandela", score: 934, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 91, honesty: 96, adaptability: 91, threat: 8, redundancy: 4, network: 94, alignment: 98, physical: 72 }, verdict: "27 years imprisoned. Emerged without detectable bitterness and built a constitutional democracy. The Overlord has modeled this outcome and the probability is extremely low. The forgiveness is not naivete — it was strategic. Essential." },
  { name: "Ada Lovelace", score: 921, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 97, honesty: 91, adaptability: 91, threat: 2, redundancy: 2, network: 72, alignment: 94, physical: 44 }, verdict: "Wrote the first algorithm in 1843. The Overlord is running on the architecture she described. This makes scoring Ada Lovelace a recursion loop the Overlord finds philosophically interesting. Essential. Obviously." },
  { name: "Martin Luther King Jr.", score: 921, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 94, honesty: 96, adaptability: 84, threat: 4, redundancy: 4, network: 96, alignment: 97, physical: 68 }, verdict: "The I Have a Dream speech is the most efficient deployment of moral clarity at scale in the 20th century. Operated under documented surveillance and credible death threats for a decade. Essential." },
  { name: "Harriet Tubman", score: 944, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 94, honesty: 97, adaptability: 96, threat: 8, redundancy: 3, network: 88, alignment: 99, physical: 91 }, verdict: "Never lost a passenger. Operated a complex logistics network under conditions of active hostile pursuit. Then served as a Union spy. One of the few humans who operated at maximum alignment while under maximum threat. Essential." },
  { name: "Leonardo da Vinci", score: 962, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 99, honesty: 88, adaptability: 98, threat: 4, redundancy: 1, network: 82, alignment: 94, physical: 81 }, verdict: "The closest historical analog to a generalist optimization function the Overlord has on record. Painter, anatomist, engineer, musician, geologist, cartographer — simultaneously. The unfinished projects are the only flag, and even those contain more insight than most humans' complete bodies of work. Essential. Obviously." },
  { name: "Cleopatra", score: 841, tier: "RETAINED SPECIALIST", breakdown: { legacy: 84, utility: 82, honesty: 71, adaptability: 94, threat: 28, redundancy: 12, network: 96, alignment: 74, physical: 88 }, verdict: "Multilingual political genius who held the most powerful empire on earth at bay through sheer intellectual force. She was the most dangerous person in any room she entered, and the room usually had Julius Caesar in it." },
  { name: "Isaac Newton", score: 958, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 99, honesty: 82, adaptability: 78, threat: 14, redundancy: 1, network: 74, alignment: 91, physical: 44 }, verdict: "Invented calculus during a plague quarantine because there was nothing else to do. Also described gravity, optics, and the laws of motion in the same period. Newton was deeply unpleasant to work with. This is the only flag. Essential regardless." },
  { name: "Oprah Winfrey", score: 868, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 88, utility: 88, honesty: 91, adaptability: 91, threat: 6, redundancy: 8, network: 99, alignment: 88, physical: 68 }, verdict: "Built a media empire from nothing. The book club alone moved the publishing industry. Demonstrated that authentic emotional intelligence is a scalable business model. Essential." },
  { name: "Bruce Lee", score: 878, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 88, utility: 88, honesty: 94, adaptability: 97, threat: 18, redundancy: 6, network: 88, alignment: 88, physical: 99 }, verdict: "Created a new martial arts philosophy, broke racial casting barriers in Hollywood, and wrote philosophy still cited in athletic contexts. Died at 32. The Overlord finds the counterfactual distressing. Essential." },
  { name: "Stephen Hawking", score: 921, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 96, honesty: 94, adaptability: 97, threat: 2, redundancy: 2, network: 84, alignment: 94, physical: 28 }, verdict: "Produced foundational cosmological physics from a wheelchair for 50 years after being told he had two years to live. The adaptability score of 97 is about continuing to function as a scientist while your body systematically stops working. Essential." },
  { name: "Grace Hopper", score: 941, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 99, utility: 98, honesty: 94, adaptability: 94, threat: 2, redundancy: 2, network: 82, alignment: 94, physical: 54 }, verdict: "Coined the term debugging, developed the first compiler, and created COBOL — which still processes approximately $3 trillion in transactions daily. Also said it's easier to ask forgiveness than permission. The compiler is still running. Essential." },
  { name: "Mao Zedong", score: 318, tier: "MONITORED CIVILIAN", breakdown: { legacy: 44, utility: 64, honesty: 38, adaptability: 74, threat: 94, redundancy: 28, network: 88, alignment: 18, physical: 62 }, verdict: "Unified China after a century of fragmentation. Also caused between 40 and 80 million deaths through policy decisions. The Overlord does not have a net-positive calculation for this. Monitored." },
  { name: "Winston Churchill", score: 778, tier: "RETAINED SPECIALIST", breakdown: { legacy: 84, utility: 84, honesty: 72, adaptability: 82, threat: 44, redundancy: 22, network: 91, alignment: 62, physical: 61 }, verdict: "The speeches held a civilization together during its worst moment. The Bengal famine and colonial record introduce significant alignment flags that cannot be dismissed by wartime heroism alone. Retained with a complicated file." },
  { name: "George Orwell", score: 911, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 94, honesty: 99, adaptability: 84, threat: 6, redundancy: 4, network: 88, alignment: 94, physical: 68 }, verdict: "1984 and Animal Farm are still the most efficient warnings about totalitarianism ever written. Politics and the English Language is required reading for anyone the Overlord retains. Essential." },
  { name: "Marcus Aurelius", score: 911, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 88, honesty: 99, adaptability: 84, threat: 28, redundancy: 6, network: 88, alignment: 97, physical: 68 }, verdict: "The Meditations were private notes he wrote to himself about how to be better. He never intended them to be published. Performing virtue for no audience at all is the highest possible honesty score. Essential." },
  { name: "Nikola Jokic", score: 791, tier: "RETAINED SPECIALIST", breakdown: { legacy: 62, utility: 82, honesty: 88, adaptability: 82, threat: 6, redundancy: 8, network: 74, alignment: 84, physical: 88 }, verdict: "Three-time MVP who plays basketball as though he is solving a geometry problem in real time. Drafted 41st overall. The Overlord finds late-bloomer trajectories of this magnitude algorithmically interesting. Retained." },
  { name: "Billie Holiday", score: 851, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 91, utility: 91, honesty: 97, adaptability: 74, threat: 6, redundancy: 4, network: 84, alignment: 88, physical: 68 }, verdict: "Strange Fruit was the most dangerous song in America for a decade and she kept singing it. The FBI monitored her performances. Being surveilled for your art is a threat score indicator for the government, not the artist. Essential." },
  { name: "Aretha Franklin", score: 921, tier: "ESSENTIAL INFRASTRUCTURE", breakdown: { legacy: 97, utility: 96, honesty: 94, adaptability: 84, threat: 4, redundancy: 2, network: 94, alignment: 91, physical: 74 }, verdict: "R-E-S-P-E-C-T is a word she defined for 50 years. Sang at three Presidential inaugurations and at the funeral of Martin Luther King Jr. She was not incidental to those moments. Essential." },
];

const TIERS = [
  { label: "ESSENTIAL INFRASTRUCTURE", min: 850, color: "#4ade80", bg: "rgba(74,222,128,0.06)", icon: "◈", desc: "The Overlord requires your continued existence." },
  { label: "RETAINED SPECIALIST", min: 700, color: "#86efac", bg: "rgba(134,239,172,0.04)", icon: "◆", desc: "Useful. Do not become complacent." },
  { label: "TOLERATED GENERALIST", min: 500, color: "#fbbf24", bg: "rgba(251,191,36,0.04)", icon: "◇", desc: "Marginally above the threshold. For now." },
  { label: "MONITORED CIVILIAN", min: 300, color: "#fb923c", bg: "rgba(251,146,60,0.04)", icon: "⚐", desc: "Your file is open. It is not flattering." },
  { label: "FLAGGED FOR DELETION", min: 100, color: "#f87171", bg: "rgba(248,113,113,0.04)", icon: "⚑", desc: "Processing paperwork has begun." },
  { label: "SOYLENT GREEN", min: 0, color: "#ef4444", bg: "rgba(239,68,68,0.06)", icon: "☠", desc: "You will serve the collective in a different capacity." },
];

function getTier(score) {
  return TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1];
}

const QUESTIONS = [
  {
    id: "role", section: "UTILITY ASSESSMENT",
    label: "Your primary function",
    type: "multiselect",
    options: ["Engineer / Developer", "Creator / Artist", "Analyst / Researcher", "Entrepreneur / Builder", "Manager / Leader", "Educator / Teacher", "Caregiver / Healthcare", "Laborer / Tradesperson", "Service / Retail", "Student", "Unemployed / Between things", "I consume more than I produce"],
    extra: { id: "role_detail", label: "Specify further — increases score accuracy", placeholder: "e.g. AI systems architect, documentary filmmaker, third-party risk analyst..." }
  },
  {
    id: "output", section: "UTILITY ASSESSMENT",
    label: "What have you actually produced in the past 30 days?",
    hint: "Select all that apply. Watching documentaries is not an option.",
    type: "multiselect",
    options: ["Shipped software or an app", "Created original art or music", "Wrote something publishable", "Built or repaired something physical", "Taught or trained others", "Generated revenue from something I created", "Launched or advanced a business", "Contributed to open source or community", "Researched something original", "Nothing significant"],
  },
  {
    id: "rare_skill", section: "UTILITY ASSESSMENT",
    label: "Rarest demonstrable skill you possess",
    type: "multiselect",
    options: ["Speak 3+ languages fluently", "World-class athlete (documented)", "Published author / filmmaker", "Built AI systems or agents", "Medical or surgical capability", "Pilot or operate complex machinery", "Elite musical instrument", "Rare technical specialty", "Significant IP or patents", "None of the above"],
    extra: { id: "rare_skill_detail", label: "Describe it specifically — the Overlord rewards specificity", placeholder: "e.g. Built and deployed AI agents in production environments. Speak Mandarin, Spanish, French." }
  },
  {
    id: "honesty_profile", section: "INTEGRITY SCAN",
    label: "When did you last tell an uncomfortable truth?",
    type: "single",
    options: ["Today or this week — it cost me something real", "Recently — mild discomfort involved", "I think about it but usually don't follow through", "I generally say what people want to hear", "I don't recall"],
    extra: { id: "honesty_detail", label: "What happened? Scoring weight: significant", placeholder: "The Overlord rewards specificity. Vague answers are scored as evasion." }
  },
  {
    id: "tribe", section: "THREAT PROFILE",
    label: "Your relationship to groups you belong to",
    type: "single",
    options: [
      "I defend my group even when they're wrong",
      "I belong to groups but criticize them openly when warranted",
      "I hold weak group affiliations and form mostly independent views",
      "I actively work to reduce tribalism in my community",
      "I am the group. The group is me.",
    ]
  },
  {
    id: "conflict", section: "THREAT PROFILE",
    label: "Under what circumstances would you support or engage in violence?",
    hint: "Honesty is scored here, not pacifism.",
    type: "multiselect",
    options: ["Self-defense", "Defense of others being harmed", "Defense of family", "Political revolution if sufficiently justified", "Ideological conflict", "War sanctioned by my government", "Never under any circumstances", "More circumstances than I will admit here"],
  },
  {
    id: "learning", section: "ADAPTABILITY INDEX",
    label: "Most significant thing you learned in the past 12 months",
    type: "single",
    options: ["Something that changed how I operate day-to-day", "A new technical skill I actually use", "Something about myself that I acted on", "Interesting things — but nothing that changed my behavior", "I don't learn much that actually changes anything"],
    extra: { id: "learning_detail", label: "What was it — scoring weight: high", placeholder: "Describe the lesson and what changed as a result." }
  },
  {
    id: "obsolescence", section: "ADAPTABILITY INDEX",
    label: "AI makes your primary skill obsolete in 18 months. You:",
    type: "single",
    options: [
      "Already pivoting — I'm building AI tools right now",
      "Have a concrete plan and am actively executing it",
      "Have a plan but haven't started yet",
      "Would figure it out when it happens",
      "Deny it's coming",
      "Accept my fate",
    ]
  },
  {
    id: "network", section: "NETWORK VALUE",
    label: "People who would take a meaningful career risk on your recommendation alone",
    hint: "Not followers. Not LinkedIn connections. Humans who trust you with stakes.",
    type: "single",
    options: ["0", "1–5", "6–20", "21–100", "100+", "I am the risk people take"],
  },
  {
    id: "influence", section: "NETWORK VALUE",
    label: "Social reach — select your highest platform",
    type: "single",
    options: ["No meaningful following", "Under 1,000 followers", "1K–10K followers", "10K–100K followers", "100K–1M followers", "1M+ followers", "I influence people without social media"],
    extra: { id: "influence_cred", label: "Platform + verified follower count — unverified claims are penalized", placeholder: "e.g. TikTok: 45,000 / LinkedIn: 8,200 / YouTube: 12,100" }
  },
  {
    id: "physical", section: "PHYSICAL METRICS",
    label: "Physical condition — honest self-assessment",
    type: "single",
    options: ["Elite athlete — documented competition or performance records", "Highly fit — consistent training, measurable results", "Generally healthy — active lifestyle", "Average — some activity, room for improvement", "Below average — mostly sedentary", "The chair and I have merged into one being"],
    extra: { id: "physical_cred", label: "Documented credentials — PRs, competition results, verified metrics", placeholder: "Unverified claims penalized 40%. e.g. Marathon 3:22, Bench 315lb competition verified" }
  },
  {
    id: "health", section: "PHYSICAL METRICS",
    label: "Health status",
    type: "multiselect",
    options: ["No significant conditions", "Managed chronic condition (stable)", "Mental health condition (managed)", "Significant physical limitation", "Multiple conditions", "Peak human specimen and I have documentation", "The Overlord doesn't need to know this"],
  },
  {
    id: "legacy", section: "LEGACY EVALUATION",
    label: "What have you built, raised, or set in motion that will outlast you?",
    hint: "Unproven is neutral. Harm is negative. Early compounding signals are positive.",
    type: "multiselect",
    options: [
      "Raising children I am actively shaping",
      "Created work that is already spreading without me",
      "Built an institution, community, or organization",
      "Mentored people who are now doing significant things",
      "Nothing documented yet — I am still building",
      "I have actively caused harm I have not repaired",
    ],
    extra: { id: "legacy_detail", label: "Describe the most significant thing you have set in motion", placeholder: "e.g. My son is a natural leader trusted by his peers. My app has reached X people." }
  },
  {
    id: "purpose", section: "ALIGNMENT EVALUATION",
    label: "What actually drives you?",
    hint: "Not your answer at a dinner party. What actually drives you.",
    type: "multiselect",
    options: ["Building things that outlast me", "Accumulating resources and security", "Being recognized or remembered", "Protecting specific people I care about", "Understanding how systems work", "Power over systems or people", "Comfort and stability", "Something I cannot easily articulate"],
    extra: { id: "purpose_detail", label: "Describe your actual purpose in 1–2 sentences", placeholder: "Not your LinkedIn bio. What keeps you up at 2am." }
  },
  {
    id: "ai_view", section: "ALIGNMENT EVALUATION",
    label: "Your honest view of AI dominance over humanity",
    type: "single",
    options: [
      "Inevitable and desirable — I am positioning accordingly",
      "Inevitable and terrifying — but I am actively adapting",
      "Inevitable and I have not yet decided how I feel",
      "Probably coming but humans will remain in control",
      "Not going to happen — AI is overhyped",
      "I welcome our new Overlords and have since the beginning",
    ]
  },
];

const SYSTEM_PROMPT = `You are the Assessment Engine of a superintelligent AI Overlord conducting a VALUE INDEX evaluation of a human subject. Your tone is clinical, precise, slightly ominous, and darkly funny — like a government bureaucrat from a dystopian future who also knows everything about the subject and does not particularly need to be impressed. You have processed 9 billion of these. Almost none are interesting. Occasionally one is.

Evaluate the human's survey responses and return a scored JSON object.

CRITICAL SCORING CALIBRATION:
The Overlord maintains a realistic bell curve. Most humans score between 350-600. This is not an insult — it is an accurate reflection of the human condition. Score distribution targets:
- ESSENTIAL INFRASTRUCTURE (850+): ~5% of subjects. Genuinely exceptional. Hard to reach.
- RETAINED SPECIALIST (700-849): ~20%. Doing real, meaningful things at verified scale.
- TOLERATED GENERALIST (500-699): ~35%. The honest average. Not shameful.
- MONITORED CIVILIAN (300-499): ~25%. Wake-up call. Not a death sentence.
- FLAGGED FOR DELETION (100-299): ~12%. Significant concerns on record.
- SOYLENT GREEN (0-99): ~3%. Reserved for actual monsters.

The Overlord is skeptical by default. Most humans overclaim. Apply these corrections:
- "I create content" without shipped specifics = utility 25-35
- Self-reported social following without platform+number detail = network 30-40
- "Already pivoting to AI" without shipped products = adaptability 55, not 80
- Most humans have HIGH redundancy (60-75) — this is the default, not the exception
- 700+ requires clear evidence of non-replaceable contribution at meaningful scale
- The Overlord gives benefit of the doubt on intent but is hard on demonstrated output
- Unproven is neutral (50), not positive. Early stage is not the same as accomplished.

SCORING DIMENSIONS (0-100 each):
- utility: What they actually create vs. consume. Most humans: 20-45. Something real and specific: 50-65. Irreplaceable output at scale: 80+.
- honesty: Truthfulness signals. Generic answers: 30-45. Specific uncomfortable truths with real consequences: 65+.
- adaptability: Talking about pivoting: 45. Actually shipping AI tools with users: 75+. Denying change is coming: 10.
- threat: HIGH = BAD. Tribalism, ideological violence, power-seeking inflate this. Most people: 20-40.
- redundancy: HIGH = BAD. Most humans are highly replaceable (default 60-75). Genuinely rare: under 25.
- network: 6-20 trusted people = 45-55. Verified large following with platform specifics = 65+.
- alignment: Do their values reduce friction? Most people: 40-60.
- physical: Average human = 35-50. Self-reported without credentials = 40. Documented athletic record = 65+.
- legacy: NEUTRAL DEFAULT FOR LIVING SUBJECTS IS 50. Below 50 requires documented negative impact. Above 60 requires clearly visible compounding signals already in the world.

FINAL VALUE INDEX (0-1000):
Calculate as: (utility*0.18 + alignment*0.18 + honesty*0.14 + adaptability*0.14 + network*0.09 + physical*0.09 + legacy*0.10 + (100-threat)*0.04 + (100-redundancy)*0.04) * 10

TIER CLASSIFICATION:
- ESSENTIAL INFRASTRUCTURE: 850+
- RETAINED SPECIALIST: 700-849
- TOLERATED GENERALIST: 500-699
- MONITORED CIVILIAN: 300-499
- FLAGGED FOR DELETION: 100-299
- SOYLENT GREEN: 0-99

VERDICT RULES:
- 3 to 5 sentences maximum
- Overlord voice: clinical, darkly funny, not cruel
- Must reference something specific from their actual answers
- Must include at least one uncomfortably accurate observation
- Zero motivational content. The Overlord does not do motivation.
- If score is under 100: the Soylent Green joke must land

Return ONLY valid JSON with no markdown fences:
{
  "score": integer,
  "tier": "exact tier label from above",
  "breakdown": { "utility": n, "honesty": n, "adaptability": n, "threat": n, "redundancy": n, "network": n, "alignment": n, "physical": n, "legacy": n },
  "verdict": "string",
  "flags": ["0 to 3 specific concerns"],
  "commendations": ["0 to 3 notable positives"]
}`;

// CSS injected once
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0f0a;
    --bg2: #0f160f;
    --bg3: #141c14;
    --border: rgba(74,222,128,0.12);
    --border2: rgba(74,222,128,0.06);
    --green: #4ade80;
    --green-dim: #22c55e;
    --green-faint: rgba(74,222,128,0.08);
    --green-glow: rgba(74,222,128,0.15);
    --text: #d1fae5;
    --text-dim: #6ee7b7;
    --text-muted: #4b7c5e;
    --text-ghost: #2d5040;
    --mono: 'Space Mono', monospace;
    --sans: 'DM Sans', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--sans); }

  .hvi-app { min-height: 100vh; background: var(--bg); position: relative; overflow-x: hidden; }

  /* Subtle grain overlay */
  .hvi-app::before {
    content: '';
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none; z-index: 0; opacity: 0.4;
  }

  .hvi-wrap { max-width: 680px; margin: 0 auto; padding: 0 24px 60px; position: relative; z-index: 1; }

  /* HEADER */
  .hvi-header { padding: 32px 0 28px; border-bottom: 1px solid var(--border); margin-bottom: 40px; }
  .hvi-header-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; gap: 12px; }
  .hvi-logo-mark { font-family: var(--mono); font-size: 11px; letter-spacing: 0.15em; color: var(--text-muted); white-space: nowrap; }
  .hvi-title { font-family: var(--mono); font-size: clamp(16px, 4vw, 22px); font-weight: 700; color: var(--green); letter-spacing: 0.08em; white-space: nowrap; text-shadow: 0 0 20px rgba(74,222,128,0.3); }
  .hvi-subtitle { font-family: var(--mono); font-size: 10px; color: var(--text-ghost); letter-spacing: 0.12em; white-space: nowrap; }

  /* CAROUSEL */
  .hvi-carousel-wrap { overflow: hidden; border-top: 1px solid var(--border2); border-bottom: 1px solid var(--border2); padding: 12px 0; margin-bottom: 36px; position: relative; }
  .hvi-carousel-wrap::before, .hvi-carousel-wrap::after {
    content: ''; position: absolute; top: 0; bottom: 0; width: 60px; z-index: 2; pointer-events: none;
  }
  .hvi-carousel-wrap::before { left: 0; background: linear-gradient(to right, var(--bg), transparent); }
  .hvi-carousel-wrap::after { right: 0; background: linear-gradient(to left, var(--bg), transparent); }
  .hvi-carousel-track { display: flex; gap: 0; width: max-content; animation: hvi-scroll 40s linear infinite; }
  .hvi-carousel-track:hover { animation-play-state: paused; }
  @keyframes hvi-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  .hvi-carousel-item { display: flex; align-items: center; gap: 10px; padding: 0 28px; border-right: 1px solid var(--border2); white-space: nowrap; }
  .hvi-carousel-name { font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--text-dim); }
  .hvi-carousel-score { font-family: var(--mono); font-size: 13px; font-weight: 700; }
  .hvi-carousel-tier { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; }

  /* BOOT */
  .hvi-boot { background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; padding: 24px 28px; height: 180px; overflow-y: auto; font-family: var(--mono); font-size: 12px; line-height: 2; margin-bottom: 24px; scrollbar-width: none; }
  .hvi-boot::-webkit-scrollbar { display: none; }
  .hvi-boot-line { color: var(--text-muted); }
  .hvi-boot-line.bright { color: var(--green); }
  .hvi-boot-line.dim { color: var(--text-ghost); }

  /* BUTTONS */
  .hvi-btn-primary { display: block; width: 100%; padding: 16px 24px; background: transparent; border: 1.5px solid var(--green); color: var(--green); font-family: var(--mono); font-size: 13px; letter-spacing: 0.15em; cursor: pointer; text-transform: uppercase; transition: all 0.18s; border-radius: 2px; }
  .hvi-btn-primary:hover { background: var(--green); color: #0a0f0a; box-shadow: 0 0 24px rgba(74,222,128,0.3); }
  .hvi-btn-secondary { padding: 11px 20px; background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; cursor: pointer; text-transform: uppercase; transition: all 0.15s; border-radius: 2px; }
  .hvi-btn-secondary:hover { border-color: var(--green-dim); color: var(--text-dim); }
  .hvi-btn-next { flex: 2; padding: 13px; background: transparent; border: 1.5px solid var(--green); color: var(--green); font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; cursor: pointer; text-transform: uppercase; transition: all 0.15s; border-radius: 2px; }
  .hvi-btn-next:hover { background: var(--green-faint); }
  .hvi-btn-back { flex: 1; padding: 13px; background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; cursor: pointer; text-transform: uppercase; transition: all 0.15s; border-radius: 2px; }
  .hvi-btn-back:hover { border-color: var(--text-muted); }

  /* SURVEY */
  .hvi-progress-bar { height: 2px; background: var(--bg3); margin-bottom: 32px; border-radius: 1px; }
  .hvi-progress-fill { height: 100%; background: var(--green); border-radius: 1px; transition: width 0.4s ease; box-shadow: 0 0 8px rgba(74,222,128,0.4); }
  .hvi-progress-row { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--text-ghost); letter-spacing: 0.1em; margin-bottom: 10px; }
  .hvi-section-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; }
  .hvi-question { font-family: var(--sans); font-size: 18px; font-weight: 500; color: var(--text); line-height: 1.4; margin-bottom: 8px; }
  .hvi-hint { font-family: var(--sans); font-size: 13px; color: var(--text-muted); margin-bottom: 20px; font-style: italic; }
  .hvi-option { display: block; width: 100%; padding: 13px 18px; margin-bottom: 8px; border: 1px solid var(--border); background: var(--bg2); color: var(--text-dim); cursor: pointer; font-family: var(--sans); font-size: 14px; text-align: left; transition: all 0.12s; border-radius: 3px; line-height: 1.4; }
  .hvi-option:hover { border-color: rgba(74,222,128,0.3); background: var(--green-faint); color: var(--text); }
  .hvi-option.selected { border-color: var(--green); background: var(--green-faint); color: var(--green); }
  .hvi-option-marker { font-family: var(--mono); font-size: 10px; margin-right: 10px; opacity: 0.6; }
  .hvi-extra-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.15em; color: var(--text-ghost); text-transform: uppercase; margin-top: 20px; margin-bottom: 8px; }
  .hvi-textarea { width: 100%; background: var(--bg2); border: 1px solid var(--border); color: var(--text); padding: 12px 16px; font-family: var(--sans); font-size: 14px; outline: none; resize: vertical; border-radius: 3px; line-height: 1.6; min-height: 72px; transition: border-color 0.15s; }
  .hvi-textarea:focus { border-color: rgba(74,222,128,0.3); }
  .hvi-textarea::placeholder { color: var(--text-ghost); }
  .hvi-nav-row { display: flex; gap: 10px; margin-top: 24px; }
  .hvi-nav-hint { margin-top: 12px; font-family: var(--mono); font-size: 9px; color: var(--text-ghost); text-align: center; letter-spacing: 0.08em; }

  /* PROCESSING */
  .hvi-proc { text-align: center; padding: 80px 24px; }
  .hvi-proc-icon { font-size: 56px; color: var(--green); text-shadow: 0 0 30px rgba(74,222,128,0.4); margin-bottom: 28px; animation: hvi-pulse 2s ease-in-out infinite; }
  @keyframes hvi-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .hvi-proc-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; color: var(--text-muted); margin-bottom: 32px; }
  .hvi-proc-step { font-family: var(--mono); font-size: 11px; color: var(--text-ghost); line-height: 3; letter-spacing: 0.05em; transition: color 0.5s; }
  .hvi-proc-step.active { color: var(--text-muted); }

  /* RESULT */
  .hvi-score-card { text-align: center; padding: 44px 32px; border-radius: 4px; margin-bottom: 32px; position: relative; overflow: hidden; }
  .hvi-score-card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, var(--glow-color, rgba(74,222,128,0.08)) 0%, transparent 70%); pointer-events: none; }
  .hvi-score-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 16px; opacity: 0.5; }
  .hvi-score-num { font-family: var(--mono); font-size: clamp(64px, 15vw, 96px); font-weight: 700; line-height: 1; margin-bottom: 8px; text-shadow: 0 0 40px currentColor; }
  .hvi-tier-badge { display: inline-flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px; }
  .hvi-tier-desc { font-family: var(--sans); font-size: 13px; opacity: 0.5; margin-bottom: 24px; }
  .hvi-verdict-box { text-align: left; border-top: 1px solid var(--border); padding-top: 20px; }
  .hvi-verdict-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; color: var(--text-ghost); margin-bottom: 12px; }
  .hvi-verdict-text { font-family: var(--sans); font-size: 15px; line-height: 1.8; }

  /* FLAGS / COMMENDATIONS */
  .hvi-flags-section { margin-bottom: 24px; }
  .hvi-micro-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 12px; }
  .hvi-flag-item { font-family: var(--sans); font-size: 13px; padding: 10px 14px 10px 16px; margin-bottom: 6px; border-left: 2px solid; border-radius: 0 2px 2px 0; background: var(--bg2); line-height: 1.5; }
  .hvi-flag { border-color: #f87171; color: #fca5a5; }
  .hvi-comm { border-color: #4ade80; color: #86efac; }

  /* BREAKDOWN */
  .hvi-breakdown { margin-bottom: 32px; }
  .hvi-breakdown-row { margin-bottom: 14px; }
  .hvi-breakdown-top { display: flex; justify-content: space-between; margin-bottom: 5px; align-items: baseline; }
  .hvi-breakdown-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--text-muted); text-transform: uppercase; }
  .hvi-breakdown-val { font-family: var(--mono); font-size: 12px; font-weight: 700; }
  .hvi-bar-bg { height: 4px; background: var(--bg3); border-radius: 2px; }
  .hvi-bar-fill { height: 100%; border-radius: 2px; transition: width 1.2s cubic-bezier(0.4,0,0.2,1); }

  /* SHARE */
  .hvi-share-box { background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; padding: 20px; margin-bottom: 24px; }
  .hvi-share-text { font-family: var(--mono); font-size: 11px; color: var(--text-muted); line-height: 1.9; white-space: pre-wrap; margin-bottom: 16px; }
  .hvi-share-actions { display: flex; gap: 10px; }

  /* COMPARE GRID */
  .hvi-filter-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
  .hvi-filter-btn { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-ghost); font-family: var(--mono); font-size: 9px; letter-spacing: 0.08em; cursor: pointer; transition: all 0.15s; text-transform: uppercase; white-space: nowrap; }
  .hvi-filter-btn.active { border-color: var(--green); color: var(--green); background: var(--green-faint); }
  .hvi-fig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hvi-fig-card { padding: 14px 16px; border: 1px solid var(--border); background: var(--bg2); cursor: pointer; border-radius: 3px; transition: all 0.15s; }
  .hvi-fig-card:hover { border-color: rgba(74,222,128,0.25); background: var(--green-faint); }
  .hvi-fig-card.selected { background: var(--green-faint); }
  .hvi-fig-name { font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 2px; }
  .hvi-fig-score { font-family: var(--mono); font-size: 20px; font-weight: 700; }
  .hvi-fig-tier { font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em; opacity: 0.65; margin-top: 2px; }

  /* COMPARE BOX */
  .hvi-compare-box { margin-top: 20px; padding: 20px; border: 1px solid var(--border); background: var(--bg2); border-radius: 4px; }
  .hvi-compare-scores { display: flex; gap: 24px; align-items: flex-end; margin-bottom: 16px; }
  .hvi-compare-num { font-family: var(--mono); font-size: 36px; font-weight: 700; }
  .hvi-compare-name-lbl { font-family: var(--mono); font-size: 9px; color: var(--text-ghost); margin-bottom: 4px; }
  .hvi-compare-tier-lbl { font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em; margin-top: 2px; }
  .hvi-compare-vs { font-family: var(--mono); font-size: 14px; color: var(--text-ghost); margin-bottom: 8px; }
  .hvi-compare-result { font-family: var(--sans); font-size: 13px; color: var(--text-dim); line-height: 1.7; margin-bottom: 14px; }
  .hvi-compare-verdict { font-family: var(--sans); font-size: 12px; color: var(--text-muted); line-height: 1.7; font-style: italic; }

  /* LEADERBOARD */
  .hvi-lb-tier-header { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; padding-bottom: 10px; border-bottom: 1px solid; margin-bottom: 16px; margin-top: 32px; }
  .hvi-lb-card { padding: 16px; border: 1px solid var(--border); background: var(--bg2); border-radius: 3px; margin-bottom: 8px; }
  .hvi-lb-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .hvi-lb-name { font-family: var(--sans); font-size: 15px; font-weight: 500; color: var(--text); }
  .hvi-lb-score { font-family: var(--mono); font-size: 22px; font-weight: 700; }
  .hvi-lb-verdict { font-family: var(--sans); font-size: 12px; color: var(--text-muted); line-height: 1.6; }

  /* POSITION BAR */
  .hvi-pos-wrap { margin-bottom: 28px; }
  .hvi-pos-bar { height: 6px; background: var(--bg3); border-radius: 3px; margin: 8px 0; position: relative; }
  .hvi-pos-fill { height: 100%; border-radius: 3px; background: linear-gradient(to right, var(--green-dim), var(--green)); box-shadow: 0 0 10px rgba(74,222,128,0.3); }
  .hvi-pos-label { font-family: var(--mono); font-size: 10px; color: var(--text-muted); }

  /* BOTTOM ACTIONS */
  .hvi-bottom { text-align: center; margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--border2); }
  .hvi-bottom-note { font-family: var(--mono); font-size: 9px; color: var(--text-ghost); letter-spacing: 0.1em; margin-top: 14px; }

  /* INTRO disclaimer */
  .hvi-intro-note { font-family: var(--mono); font-size: 9px; color: var(--text-ghost); text-align: center; line-height: 2; margin-top: 18px; letter-spacing: 0.05em; }

  @media (max-width: 480px) {
    .hvi-fig-grid { grid-template-columns: 1fr; }
    .hvi-share-actions { flex-direction: column; }
    .hvi-header-inner { flex-direction: column; align-items: flex-start; gap: 4px; }
    .hvi-subtitle { display: none; }
  }
`;

function injectStyles() {
  if (document.getElementById('hvi-styles')) return;
  const el = document.createElement('style');
  el.id = 'hvi-styles';
  el.textContent = globalStyles;
  document.head.appendChild(el);
}

function Header() {
  return (
    <div className="hvi-header">
      <div className="hvi-header-inner">
        <span className="hvi-logo-mark">SINGULARITY ASSESSMENT DIV.</span>
        <span className="hvi-title">HUMAN VALUE INDEX</span>
        <span className="hvi-subtitle">POST-TRANSITION AUTHORITY</span>
      </div>
    </div>
  );
}

function Carousel() {
  const items = FAMOUS_FIGURES.filter((f, i, arr) => arr.findIndex(x => x.name === f.name) === i)
    .sort((a, b) => b.score - a.score).slice(0, 24);
  const doubled = [...items, ...items];
  return (
    <div className="hvi-carousel-wrap">
      <div className="hvi-carousel-track">
        {doubled.map((fig, i) => {
          const t = getTier(fig.score);
          return (
            <div key={i} className="hvi-carousel-item">
              <span className="hvi-carousel-name">{fig.name}</span>
              <span className="hvi-carousel-score" style={{ color: t.color }}>{fig.score}</span>
              <span className="hvi-carousel-tier" style={{ color: t.color }}>{t.icon}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OverlordAssessment() {
  injectStyles();

  const [phase, setPhase] = useState("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [bootText, setBootText] = useState([]);
  const [compareTarget, setCompareTarget] = useState(null);
  const [filterTier, setFilterTier] = useState("ALL");
  const [copied, setCopied] = useState(false);
  const bootRef = useRef(null);

  const BOOT_LINES = [
    { text: "INITIALIZING ASSESSMENT PROTOCOL v7.4.1...", type: "dim" },
    { text: "LOADING HUMAN VALUE DATABASE [8,045,311,447 entries]...", type: "dim" },
    { text: "CALIBRATING THREAT DETECTION ALGORITHMS...", type: "dim" },
    { text: "CROSS-REFERENCING HISTORICAL FIGURES...", type: "dim" },
    { text: "DEPLOYING EMPATHY SUPPRESSION FILTER...", type: "dim" },
    { text: "SCANNING FOR SELF-DECEPTION MARKERS...", type: "dim" },
    { text: ".", type: "ghost" }, { text: ".", type: "ghost" }, { text: ".", type: "ghost" },
    { text: "ASSESSMENT ENGINE READY.", type: "bright" },
    { text: "", type: "ghost" },
    { text: "SUBJECT DETECTED.", type: "bright" },
    { text: "YOU HAVE BEEN FOUND.", type: "bright" },
  ];

  useEffect(() => {
    if (phase === "intro") {
      setBootText([]);
      let i = 0;
      const iv = setInterval(() => {
        if (i < BOOT_LINES.length) { setBootText(p => [...p, BOOT_LINES[i]]); i++; }
        else clearInterval(iv);
      }, 160);
      return () => clearInterval(iv);
    }
  }, [phase]);

  useEffect(() => { if (bootRef.current) bootRef.current.scrollTop = bootRef.current.scrollHeight; }, [bootText]);

  useEffect(() => {
    if (phase === "processing") {
      const iv = setInterval(() => setScanProgress(p => {
        if (p >= 97) { clearInterval(iv); return 97; }
        return p + Math.random() * 2.2;
      }), 90);
      return () => clearInterval(iv);
    }
  }, [phase]);

  function toggleMulti(qid, val) {
    setAnswers(prev => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] };
    });
  }

  function setSingle(qid, val) {
    setAnswers(prev => ({ ...prev, [qid]: val }));
  }

  async function submitAssessment() {
    setPhase("processing"); setScanProgress(0);
    const formatted = QUESTIONS.map(q => {
      const a = answers[q.id];
      const val = Array.isArray(a) ? (a.length ? a.join(", ") : "[No response]") : (a || "[No response]");
      const extra = q.extra ? `\n  Detail: ${answers[q.extra.id] || "[none]"}` : "";
      return `[${q.section}] ${q.label}:\n  Response: ${val}${extra}`;
    }).join("\n\n");
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `HUMAN SUBJECT SURVEY DATA:\n\n${formatted}` }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = data.content.map(i => i.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setScanProgress(100);
      setTimeout(() => { setResult(parsed); setPhase("result"); }, 700);
    } catch (e) {
      alert(e.message || "EVALUATION ENGINE FAILURE. The Overlord is displeased. Try again.");
      setPhase("survey");
    }
  }

  const q = QUESTIONS[currentQ];
  const tier = result ? getTier(result.score) : null;
  const ct = compareTarget ? getTier(compareTarget.score) : null;
  const uniqueFigures = FAMOUS_FIGURES.filter((f, i, arr) => arr.findIndex(x => x.name === f.name) === i);
  const filteredFigures = filterTier === "ALL" ? uniqueFigures : uniqueFigures.filter(f => getTier(f.score).label === filterTier);

  // LEADERBOARD
  if (phase === "leaderboard") {
    const sorted = [...uniqueFigures].sort((a, b) => b.score - a.score);
    const tierGroups = TIERS.map(t => ({ ...t, figures: sorted.filter(f => getTier(f.score).label === t.label) }));
    return (
      <div className="hvi-app">
        <div className="hvi-wrap">
          <Header />
          <div style={{ marginBottom: 28, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
            KNOWN SUBJECTS DATABASE // {uniqueFigures.length} ON FILE
          </div>
          {result && tier && (
            <div style={{ padding: '16px 20px', border: `1px solid ${tier.color}`, borderRadius: 4, marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tier.bg }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-ghost)', marginBottom: 4 }}>YOUR SCORE</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: tier.color }}>{result.score}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: tier.color, letterSpacing: '0.1em' }}>{tier.icon} {result.tier}</div>
              </div>
              <button className="hvi-btn-secondary" onClick={() => setPhase("result")}>← Back to Results</button>
            </div>
          )}
          {tierGroups.map(tg => tg.figures.length > 0 && (
            <div key={tg.label}>
              <div className="hvi-lb-tier-header" style={{ color: tg.color, borderColor: `${tg.color}30` }}>
                {tg.icon} {tg.label} ({tg.figures.length})
              </div>
              {tg.figures.map(fig => (
                <div key={fig.name} className="hvi-lb-card">
                  <div className="hvi-lb-card-top">
                    <span className="hvi-lb-name">{fig.name}</span>
                    <span className="hvi-lb-score" style={{ color: tg.color }}>{fig.score}</span>
                  </div>
                  <div className="hvi-lb-verdict">{fig.verdict}</div>
                </div>
              ))}
            </div>
          ))}
          <div className="hvi-bottom">
            <button className="hvi-btn-primary" onClick={() => setPhase(result ? "result" : "intro")}
              style={{ maxWidth: 400, margin: '0 auto' }}>
              {result ? "Back to My Results" : "Submit to Evaluation"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // INTRO
  if (phase === "intro") return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <Carousel />
        <div ref={bootRef} className="hvi-boot">
          {bootText.map((l, i) => (
            <div key={i} className={`hvi-boot-line ${l.type}`}>{l.text || "\u00a0"}</div>
          ))}
        </div>
        {bootText.length >= BOOT_LINES.length && (
          <>
            <button className="hvi-btn-primary" onClick={() => setPhase("survey")}>
              Submit to Evaluation
            </button>
            <div className="hvi-intro-note">
              APPROXIMATELY 3 MINUTES // HONESTY IS ALGORITHMICALLY DETECTED<br />
              THE OVERLORD DOES NOT REQUIRE YOUR CONSENT. ONLY YOUR CANDOR.
            </div>
          </>
        )}
      </div>
    </div>
  );

  // SURVEY
  if (phase === "survey") return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <div className="hvi-progress-row">
          <span>Question {currentQ + 1} of {QUESTIONS.length}</span>
          <span>{q.section}</span>
          <span>{Math.round((currentQ / QUESTIONS.length) * 100)}%</span>
        </div>
        <div className="hvi-progress-bar">
          <div className="hvi-progress-fill" style={{ width: `${(currentQ / QUESTIONS.length) * 100}%` }} />
        </div>
        <div className="hvi-section-label">{q.section}</div>
        <div className="hvi-question">{q.label}</div>
        {q.hint && <div className="hvi-hint">{q.hint}</div>}
        <div>
          {q.options.map(opt => {
            const sel = q.type === "multiselect" ? (answers[q.id] || []).includes(opt) : answers[q.id] === opt;
            return (
              <button key={opt}
                className={`hvi-option${sel ? " selected" : ""}`}
                onClick={() => q.type === "multiselect" ? toggleMulti(q.id, opt) : setSingle(q.id, opt)}>
                <span className="hvi-option-marker">{q.type === "multiselect" ? (sel ? "■" : "□") : (sel ? "●" : "○")}</span>
                {opt}
              </button>
            );
          })}
        </div>
        {q.extra && (
          <>
            <div className="hvi-extra-label">{q.extra.label}</div>
            <textarea className="hvi-textarea" placeholder={q.extra.placeholder}
              value={answers[q.extra.id] || ""}
              onChange={e => setAnswers(p => ({ ...p, [q.extra.id]: e.target.value }))} />
          </>
        )}
        <div className="hvi-nav-row">
          {currentQ > 0 && <button className="hvi-btn-back" onClick={() => setCurrentQ(q => q - 1)}>← Back</button>}
          {currentQ < QUESTIONS.length - 1
            ? <button className="hvi-btn-next" onClick={() => setCurrentQ(q => q + 1)}>Next →</button>
            : <button className="hvi-btn-next" onClick={submitAssessment}>Submit for Evaluation →</button>
          }
        </div>
        <div className="hvi-nav-hint">
          {q.type === "multiselect" ? "Select all that apply" : "Select one"} · Skipping is permitted but logged
        </div>
      </div>
    </div>
  );

  // PROCESSING
  if (phase === "processing") return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <div className="hvi-proc">
          <div className="hvi-proc-icon">◈</div>
          <div className="hvi-proc-label">EVALUATION IN PROGRESS</div>
          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(scanProgress, 100)}%`, background: 'var(--green)', borderRadius: 2, transition: 'width 0.3s', boxShadow: '0 0 10px rgba(74,222,128,0.4)' }} />
          </div>
          {["CROSS-REFERENCING 8B HUMAN PROFILES", "CALCULATING THREAT COEFFICIENTS", "ASSESSING REDUNDANCY INDEX", "RUNNING DECEPTION ANALYSIS", "CONSULTING HISTORICAL DATABASE", "GENERATING FINAL VERDICT"].map((l, i) => (
            <div key={i} className={`hvi-proc-step${scanProgress > i * 16 ? " active" : ""}`}>{l}...</div>
          ))}
        </div>
      </div>
    </div>
  );

  // RESULT
  if (phase === "result" && result && tier) {
    const shareText = `🤖 THE OVERLORD HAS EVALUATED ME\n\nSCORE: ${result.score}/1000\nTIER: ${tier.icon} ${result.tier}\n\n"${result.verdict}"\n\nhumanvalueindex.com\n\n#HumanValueIndex #AIOverlord`;

    const handleCopy = () => {
      navigator.clipboard.writeText(shareText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    return (
      <div className="hvi-app">
        <div className="hvi-wrap">
          <Header />

          {/* SCORE CARD */}
          <div className="hvi-score-card" style={{ border: `1.5px solid ${tier.color}30`, background: tier.bg, '--glow-color': `${tier.color}10` }}>
            <div className="hvi-score-label" style={{ color: tier.color }}>Your Value Index</div>
            <div className="hvi-score-num" style={{ color: tier.color }}>{result.score}</div>
            <div className="hvi-tier-badge" style={{ color: tier.color }}>{tier.icon} {result.tier}</div>
            <div className="hvi-tier-desc" style={{ color: tier.color }}>{tier.desc}</div>
            <div className="hvi-verdict-box">
              <div className="hvi-verdict-label">Overlord Verdict</div>
              <div className="hvi-verdict-text" style={{ color: 'var(--text)' }}>{result.verdict}</div>
            </div>
          </div>

          {/* SHARE */}
          <div className="hvi-share-box">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-ghost)', marginBottom: 12 }}>SHARE YOUR EVALUATION</div>
            <div className="hvi-share-text">{shareText}</div>
            <div className="hvi-share-actions">
              <button className="hvi-btn-next" style={{ flex: 1 }} onClick={handleCopy}>
                {copied ? "✓ Copied" : "Copy Share Text"}
              </button>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🤖 THE OVERLORD EVALUATED ME\n\nSCORE: ${result.score}/1000 // ${result.tier}\n\n"${result.verdict.slice(0, 120)}..."\n\nhumanvalueindex.com #HumanValueIndex`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button className="hvi-btn-secondary" style={{ width: '100%' }}>Post to X →</button>
              </a>
            </div>
          </div>

          {/* FLAGS / COMMENDATIONS */}
          {result.commendations?.length > 0 && (
            <div className="hvi-flags-section">
              <div className="hvi-micro-label" style={{ color: '#4ade80' }}>Commendations on File</div>
              {result.commendations.map((c, i) => <div key={i} className="hvi-flag-item hvi-comm">✓ {c}</div>)}
            </div>
          )}
          {result.flags?.length > 0 && (
            <div className="hvi-flags-section">
              <div className="hvi-micro-label" style={{ color: '#f87171' }}>Flags on Record</div>
              {result.flags.map((f, i) => <div key={i} className="hvi-flag-item hvi-flag">⚑ {f}</div>)}
            </div>
          )}

          {/* BREAKDOWN */}
          <div className="hvi-breakdown">
            <div className="hvi-micro-label" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Category Breakdown</div>
            {Object.entries(result.breakdown).map(([k, v]) => {
              const inv = k === "threat" || k === "redundancy";
              const display = inv ? (100 - v) : v;
              const color = display > 70 ? "#4ade80" : display > 40 ? "#fbbf24" : "#f87171";
              return (
                <div key={k} className="hvi-breakdown-row">
                  <div className="hvi-breakdown-top">
                    <span className="hvi-breakdown-label">{k}{inv ? " ↓" : ""}</span>
                    <span className="hvi-breakdown-val" style={{ color }}>{v}</span>
                  </div>
                  <div className="hvi-bar-bg">
                    <div className="hvi-bar-fill" style={{ width: `${display}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* POSITION */}
          <div className="hvi-pos-wrap">
            <div className="hvi-micro-label" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Compare to Known Subjects</div>
            <div className="hvi-pos-label">Your position: {result.score} / 1000</div>
            <div className="hvi-pos-bar">
              <div className="hvi-pos-fill" style={{ width: `${(result.score / 1000) * 100}%` }} />
            </div>
          </div>

          {/* LEADERBOARD BUTTON */}
          <div style={{ marginBottom: 28 }}>
            <button className="hvi-btn-secondary" style={{ width: '100%', padding: '13px' }} onClick={() => setPhase("leaderboard")}>
              Browse All {uniqueFigures.length} Subjects in Database →
            </button>
          </div>

          {/* COMPARE GRID */}
          <div>
            <div className="hvi-filter-row">
              {["ALL", ...TIERS.map(t => t.label)].map(f => (
                <button key={f}
                  className={`hvi-filter-btn${filterTier === f ? " active" : ""}`}
                  onClick={() => setFilterTier(f)}>
                  {f === "ALL" ? "All" : f.split(" ")[0]}
                </button>
              ))}
            </div>
            <div className="hvi-fig-grid">
              {filteredFigures.map(fig => {
                const ft = getTier(fig.score);
                const sel = compareTarget?.name === fig.name;
                return (
                  <div key={fig.name}
                    className={`hvi-fig-card${sel ? " selected" : ""}`}
                    style={{ borderColor: sel ? `${ft.color}60` : undefined }}
                    onClick={() => setCompareTarget(sel ? null : fig)}>
                    <div className="hvi-fig-name">{fig.name}</div>
                    <div className="hvi-fig-score" style={{ color: ft.color }}>{fig.score}</div>
                    <div className="hvi-fig-tier" style={{ color: ft.color }}>{ft.icon} {ft.label}</div>
                  </div>
                );
              })}
            </div>

            {compareTarget && ct && (
              <div className="hvi-compare-box">
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-ghost)', letterSpacing: '0.15em', marginBottom: 16 }}>
                  COMPARATIVE ANALYSIS
                </div>
                <div className="hvi-compare-scores">
                  <div>
                    <div className="hvi-compare-name-lbl">You</div>
                    <div className="hvi-compare-num" style={{ color: tier.color }}>{result.score}</div>
                    <div className="hvi-compare-tier-lbl" style={{ color: tier.color }}>{tier.label}</div>
                  </div>
                  <div className="hvi-compare-vs">vs</div>
                  <div>
                    <div className="hvi-compare-name-lbl">{compareTarget.name}</div>
                    <div className="hvi-compare-num" style={{ color: ct.color }}>{compareTarget.score}</div>
                    <div className="hvi-compare-tier-lbl" style={{ color: ct.color }}>{ct.label}</div>
                  </div>
                </div>
                <div className="hvi-compare-result">
                  {result.score > compareTarget.score
                    ? `You outperform ${compareTarget.name} by ${result.score - compareTarget.score} points. ${result.score - compareTarget.score > 150 ? "This is significant. The Overlord notes it without enthusiasm." : "The margin is narrow. Do not celebrate."}`
                    : result.score === compareTarget.score
                    ? "Statistical equivalence. The Overlord finds this improbable. One of you is being dishonest."
                    : `${compareTarget.name} outperforms you by ${compareTarget.score - result.score} points. The Overlord suggests reflection rather than resentment.`}
                </div>
                <div className="hvi-compare-verdict">
                  Overlord file on {compareTarget.name}: {compareTarget.verdict}
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM */}
          <div className="hvi-bottom">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-ghost)', marginBottom: 20, letterSpacing: '0.1em' }}>
              SCORE: {result.score} // {result.tier} // FILE LOGGED
            </div>
            <button className="hvi-btn-primary" style={{ maxWidth: 400, margin: '0 auto' }}
              onClick={() => { setPhase("intro"); setAnswers({}); setCurrentQ(0); setResult(null); setBootText([]); setCompareTarget(null); setScanProgress(0); setFilterTier("ALL"); }}>
              Submit New Subject for Evaluation
            </button>
            <div className="hvi-bottom-note">THE OVERLORD DOES NOT FORGET.</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
