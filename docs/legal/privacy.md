# PRIVACY NOTICE

> The Department keeps files. This is the list of what is in them, who else holds a copy, and how to have yours shredded.

Last updated: 2026-10-05. Operator: [Iridescent](https://iridescent-studio.netlify.app), the games and media studio that publishes the Human Value Index. Contact: the [request form](#dispute).

## The short version

- You do not need an account or an email address to be assessed. Your file is identified by a random case number.
- What you say in your interview is stored so your file can be scored and re-scored. You can **purge it** at any time (below).
- An email address is stored only if you choose to secure your file with one.
- There are no ads, no analytics trackers and no tracking cookies. Nothing is sold.

## What is collected, and why

**Your case file.** When you sit for an interview the Department creates a case number (like HVI-7Q2M4K9D) and a file under it. The file holds: the interview transcript (your words and the Officer's), your scores, tier, verdict, flags and commendations, the raw scoring output, the date of each visit and appeal, and any directives you accept in the city. *Why:* to score you, show you your file, let you appeal, and re-score files when the method changes.

**Your file photo.** If you describe your appearance for the file photo, that description is sent to the scoring model once and turned into a few pixel-avatar choices (hair, build, clothes, one accessory). Only those choices are stored. The description itself is not kept, and it is removed from the transcript before scoring.

**Voice interviews.** If you choose voice, your microphone audio streams from your browser directly to ElevenLabs, which transcribes it and runs the Intake Officer. ElevenLabs records the conversation audio and transcript and keeps them for **30 days** under this site's settings. The transcript is then sent to the Department for scoring and stored in your file. Your voice itself is never stored by the Department. If you prefer, choose **Type instead**: no microphone is used.

**Typed interviews.** Each message is sent to the Department's server and to Anthropic to write the Officer's next line. Messages are not stored one by one; the finished transcript is stored in your file when it is scored.

**The written survey.** Survey answers are sent to Anthropic for scoring and the result is shown to you. The Department does not store survey answers.

**Your public card.** Once scored, a card appears in the holding pen and the city as "Subject" plus the last four characters of your case number, with your score, tier and pixel avatar. Your verdict and transcript are never public.

**Email (optional).** If you secure your file with an email address, the address is stored with the list of case numbers it holds, and a sign-in link is sent to it through Resend. Sign-in links expire after 15 minutes. Signing in sets one cookie (below).

**Referrals.** If you refer a public figure, the name you typed is looked up on Wikipedia and Wikidata and the figure is scored from that public record. The figure's file records the last four characters of your case number as its referrer. That is not shown publicly.

**Proposals, co-signatures and Assembly ballots.** A proposal's type, place, title and description are published on the docket with a four-character tag made from a one-way hash of your case number ("FILED BY SUBJECT 7F3A"), never the case number or its characters. Before it is stored, the text is sent once to Anthropic for an automated content check; a refused proposal is not stored. Co-signatures and ballots are stored under one-way, salted hashes of the case number, with a salted hash of your IP address and of a random device id kept in your browser (hvi-device), to enforce the per-address and per-device limits. Only counts are shown publicly. Purging your file does not remove a published proposal's text, which carries no link back to you beyond the tag.

**The Treasury (CYCLES).** If your file draws the daily allowance, the Department keeps a ledger for it: your CYCLES balance, every disbursement, your citizen's daily spending, your positions in the district industries and their daily returns. It is stored under a one-way, salted hash of your case number (never the case number itself), with a salted hash of your IP address, of the random device id in your browser (hvi-device) and, if the file is secured, of the email account, to enforce one allowance per citizen. The ledger is held in a Supabase (Postgres) database that only the Department's server can read. Nothing in it is shown publicly except totals per industry. Your citizen's assigned apartment is computed from your tier when you look at it; it is not stored.

**Disputes and correction requests.** If you file a request, the Department stores what you enter (your name, your relationship to the subject, the file, what is wrong and your email address) and emails a copy to the operator's own inbox so a human can review it.

**Your IP address.** Used only to rate-limit requests (to stop abuse and runaway costs). It is stored as a one-way, salted hash inside hourly, daily and monthly counters, which are deleted 7 days after the period they count. The hosting provider also sees IP addresses in its request logs.

## Cookies and browser storage

One cookie: **hvi_sid**, set only if you sign in with email. It keeps you signed in for 30 days. It is HttpOnly and only a hash of it is stored on the server.

The site also keeps a few things in your browser's local storage, which never leave your device on their own: your case number (hvi-case-id), a cached copy of your latest result (hvi-last-result), whether you have seen the boot screen and help notes, your city and index view settings, and any referrals queued while offline. Clearing your browser data removes them.

No analytics, advertising or tracking scripts are used. (The "Analytics" screen charts the public figure roster, not you.)

## Who else processes it

| Service | What it receives | Why |
|---|---|---|
| Netlify (USA) | Everything above, as host | Serves the site, runs its functions, stores the files (Netlify Blobs) |
| Anthropic (USA) | Interview transcripts, typed messages, survey answers, file-photo descriptions, referred names | The AI models that interview and score |
| ElevenLabs (USA) | Voice audio and transcript (voice interviews only) | Speech recognition and the voice Officer. ElevenLabs uses Google's Gemini model to write the Officer's lines |
| Resend (USA) | Your email address and the sign-in email; dispute copies to the operator | Sends email |
| Supabase (USA) | The Treasury's ledger: hashed case number, hashed IP / device / email account, CYCLES entries and positions | Stores the play-currency ledger (Postgres, us-east-1) |
| Google Fonts | Your IP address and browser details | Delivers the terminal typeface |
| Wikipedia / Wikidata | Names of public figures being referred (no data about you) | The public record |

Each provider keeps the data it receives under its own published policy, and sets its own retention for it; the site does not control those schedules. Anthropic does not train its models on data sent through its commercial API by default. The one provider setting the site controls is ElevenLabs voice retention, set to 30 days. Their policies: [Anthropic](https://www.anthropic.com/legal/privacy), [ElevenLabs](https://elevenlabs.io/privacy-policy), [Resend](https://resend.com/legal/privacy-policy), [Netlify](https://www.netlify.com/privacy/), [Supabase](https://supabase.com/privacy), [Google Fonts](https://developers.google.com/fonts/faq/privacy).

## How long it is kept

A sweep runs once a day and deletes whatever has passed these limits.

- **Case files:** **24 months after your last visit**, then deleted: the file, its public card and its link to your email. A visit is you sitting for an interview, filing an appeal or taking a directive in the city. Changes the Department makes to a file (a method update, a review) do not count as visits. You can purge sooner at any time (below).
- **Email address:** until the last file it holds is purged or expires.
- **ElevenLabs voice recordings:** 30 days.
- **Sign-in links:** single use, expire after 15 minutes, and are deleted within a day after that.
- **Sessions:** 30 days, or until you log out. Expired sessions are deleted within a day.
- **Dispute requests:** **2 years** after they are filed, then deleted. The copy emailed to the operator's inbox is deleted on the same 2-year schedule.
- **Casino chips:** the play-chip balance and any table in progress are stored under the case number, and deleted with the file (purged or expired). The weekly casino board shows only the last four characters of a case number.
- **The Treasury's ledger (CYCLES):** kept while the file exists, and deleted with it: purging your file, or its expiry 24 months after your last visit, deletes every ledger entry, position, allowance claim and wallet record for the case. Per-industry totals and daily returns, which hold no case, are kept.
- **Department mail:** the letters the site generates for your file (from the day's paper, the market, the shops and the city's calendar; nobody else writes to you, and nothing you type is stored with them) are kept with the file and deleted with it, purged or expired 24 months after your last visit. A letter you delete is removed for good after 30 days.
- **Rate-limit counters:** hashed, and deleted **7 days** after the hour, day or month they count.

## Purge your file

Use **PURGE MY FILE** below. It deletes the case file on this browser (transcripts, scores, verdicts, photo, history), its department mail, its casino chips and its Treasury ledger (CYCLES, positions, claims), removes its public card, and detaches it from your email. If that was the last file on your email address, the address and your sign-in are deleted too.

If the file is secured to an email address, you must be signed in with that address to purge it. If it is not, holding the case number is enough, the same as for viewing it. Copies already held by a provider (ElevenLabs' 30-day recordings, provider logs) expire on their own schedule. A file you never purge is deleted anyway 24 months after your last visit.

<!-- purge -->

Lost your case number? [File a request](#dispute) and choose "privacy request."

## Children

The Human Value Index is not for children. You must be **16 or older** to sit for an interview. If you believe a child has been assessed, [file a request](#dispute) and the file will be purged.

## Your rights

You can see your file (MY FILE), correct it (appeal, or [dispute](#dispute)), and delete it (purge). Depending on where you live you may have further rights, such as a copy of your data; ask through the [request form](#dispute). The Department does not sell or share personal information for advertising.

## Contact

Use the [request form](#dispute) and choose "privacy request." A person at Iridescent reads every request and replies within 7 days. The form is the only contact channel.
