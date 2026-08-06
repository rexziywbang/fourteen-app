export type HintProfile = {
  firstName: string;
  lastName: string;
  classYear: number;
  joinedMonth: string;
  activeHourBucket?: "night_owl" | "early_bird" | null;
  sharedCircleCount: number;
  senderHasRecipient: boolean;
  recipientHasSender: boolean;
  sentAt: Date;
};

type WeightedHint = { text: string; weight: number };

export function recipientHintDto(input: { dayIndex: number; hintText: string; unlockedAt: string | null }) {
  return {
    dayIndex: input.dayIndex,
    hintText: input.unlockedAt ? input.hintText : null,
    unlockedAt: input.unlockedAt,
  };
}

export function buildHintLadder(sender: HintProfile, recipientYear: number) {
  const yearDifference = sender.classYear - recipientYear;
  const relativeYear =
    yearDifference === 0
      ? "They're in your year."
      : yearDifference === 1
        ? "They're a year below you."
        : yearDifference === -1
          ? "They're a year above you."
          : `You're ${Math.abs(yearDifference)} years apart.`;

  const candidates: WeightedHint[] = [
    {
      text: `They sent this on a ${sender.sentAt.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Detroit" })}.`,
      weight: 5,
    },
    { text: relativeYear, weight: 10 },
    { text: `They joined in ${sender.joinedMonth}.`, weight: 14 },
    {
      text:
        sender.sharedCircleCount === 0
          ? "You have no one in common. Interesting."
          : `You have ${sender.sharedCircleCount} ${sender.sharedCircleCount === 1 ? "person" : "people"} in common.`,
      weight: 22,
    },
    {
      text: sender.senderHasRecipient
        ? "You're in their circle."
        : "You're not in their circle. Yet.",
      weight: sender.senderHasRecipient ? 50 : 30,
    },
    {
      text: sender.recipientHasSender
        ? "They're in your circle."
        : "They're not in your circle.",
      weight: sender.recipientHasSender ? 55 : 35,
    },
    { text: `Their first name has ${sender.firstName.length} letters.`, weight: 60 },
    { text: `Their last name starts with ${sender.lastName[0].toUpperCase()}.`, weight: 70 },
  ];

  if (sender.activeHourBucket) {
    candidates.push({
      text:
        sender.activeHourBucket === "night_owl"
          ? "They're a night owl — usually on after 11pm."
          : "They're an early bird — usually on before noon.",
      weight: 18,
    });
  }

  const ordered = candidates.sort((a, b) => a.weight - b.weight).map((hint) => hint.text);
  const neutralFillers = [
    "They signed in with a Michigan email.",
    "They completed a Fourteen profile.",
    "This is the only crush they've sent this week.",
    "They chose your name from search.",
    "They picked the message from a fixed list.",
  ];
  // DECISION: These immutable facts fill days 1-12 in the manual MVP. The production
  // migration keeps the canonical hint engine isolated so richer real-data hints can replace them.
  const firstTwelve = [...new Set([...ordered, ...neutralFillers])].slice(0, 12);
  while (firstTwelve.length < 12) firstTwelve.push(`Their note is still anonymous — day ${firstTwelve.length + 1}.`);

  return [
    ...firstTwelve,
    `Their first name starts with ${sender.firstName[0].toUpperCase()}.`,
    `First two letters: ${sender.firstName.slice(0, 2)}.`,
  ];
}
