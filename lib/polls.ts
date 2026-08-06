export type PollCandidate = { id: string; lastFeaturedAt?: string | null };

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function seededOrder<T>(items: T[], seed: string, key: (item: T) => string) {
  return [...items].sort((left, right) => hash(`${seed}:${key(left)}`) - hash(`${seed}:${key(right)}`));
}

export function buildPollOptionIds(people: PollCandidate[], seed: string, cardCount = 6, optionsPerCard = 4) {
  if (people.length < optionsPerCard) throw new Error("Not enough people for a poll round.");
  const totalSlots = cardCount * optionsPerCard;
  const appearanceCap = people.length >= Math.ceil(totalSlots / 2) ? 2 : Math.ceil(totalSlots / people.length);
  const usage = new Map(people.map((person) => [person.id, 0]));
  const lastSeen = (person: PollCandidate) => person.lastFeaturedAt ? Date.parse(person.lastFeaturedAt) : Number.NEGATIVE_INFINITY;
  const cards: string[][] = [];

  for (let position = 0; position < cardCount; position += 1) {
    const eligible = people.filter((person) => (usage.get(person.id) || 0) < appearanceCap);
    const ranked = seededOrder(eligible, `${seed}:${position}`, (person) => person.id).sort((left, right) => {
      const usageDifference = (usage.get(left.id) || 0) - (usage.get(right.id) || 0);
      if (usageDifference) return usageDifference;
      return lastSeen(left) - lastSeen(right);
    });
    const card = ranked.slice(0, optionsPerCard);
    if (card.length < optionsPerCard) throw new Error("Unable to build a balanced poll round.");
    cards.push(card.map((person) => person.id));
    for (const person of card) usage.set(person.id, (usage.get(person.id) || 0) + 1);
  }

  return cards;
}
