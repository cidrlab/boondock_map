// Blocklist for the community submission filter. Matching happens on
// normalized text (lowercased, leetspeak mapped, separators stripped) with
// word boundaries, so casual evasion like "F.u.c.k" or "sh1t" still matches
// while "Scunthorpe"-style innocents don't. Submissions matching anything
// here are rejected outright — held-for-review is reserved for softer
// signals (links, phone numbers, shouting).
//
// The list stays deliberately short: profanity and slurs only. Judgment
// calls (rudeness, disputes about a spot) belong to moderation, not regex.

export const BLOCKED_WORDS = [
  // profanity
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit',
  'shithole', 'asshole', 'bitch', 'bastard', 'cunt', 'dick', 'dickhead',
  'cock', 'pussy', 'twat', 'wanker', 'prick', 'douchebag', 'jackass',
  'dumbass', 'goddamn',
  // slurs
  'nigger', 'nigga', 'faggot', 'fag', 'dyke', 'tranny', 'retard',
  'retarded', 'spic', 'wetback', 'kike', 'chink', 'gook', 'raghead',
  'towelhead', 'beaner', 'redskin', 'injun',
  // sexual content markers (spam vector on anonymous forms)
  'porn', 'xxx', 'viagra', 'cialis', 'onlyfans', 'escort',
]
