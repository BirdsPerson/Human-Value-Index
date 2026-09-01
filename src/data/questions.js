export const QUESTIONS = [
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
