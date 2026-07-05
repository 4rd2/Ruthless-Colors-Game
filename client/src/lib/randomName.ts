// ============================================================
// Random Name Generator — Adjective + Animal
//
// Used when the name field is left blank. Word lengths are
// budgeted so base names fit the 16-char name input
// (adjectives ≤ 8, animals ≤ 7 → base ≤ 15 chars).
// ============================================================

const ADJECTIVES = [
    'Ruthless', 'Sneaky', 'Wild', 'Cunning', 'Lucky', 'Chaotic', 'Feral',
    'Brutal', 'Savage', 'Slick', 'Swift', 'Bold', 'Crafty', 'Daring',
    'Fierce', 'Grumpy', 'Jolly', 'Mighty', 'Nimble', 'Rowdy', 'Sassy',
    'Shady', 'Sleepy', 'Spicy', 'Sturdy', 'Turbo', 'Witty', 'Zesty',
    'Blazing', 'Bouncy', 'Breezy', 'Cheeky', 'Cosmic', 'Dizzy', 'Electric',
    'Frosty', 'Furtive', 'Gutsy', 'Hasty', 'Icy', 'Loopy', 'Merciless',
    'Moody', 'Mystic', 'Plucky', 'Rapid', 'Rogue', 'Snappy', 'Stormy', 'Vivid',
] as const;

const ANIMALS = [
    'Panda', 'Otter', 'Fox', 'Viper', 'Raven', 'Badger', 'Cobra',
    'Falcon', 'Gecko', 'Hyena', 'Jackal', 'Koala', 'Lemur', 'Lynx',
    'Mantis', 'Moose', 'Ocelot', 'Owl', 'Panther', 'Piranha', 'Possum',
    'Rabbit', 'Racoon', 'Shark', 'Skunk', 'Sloth', 'Stoat', 'Tiger',
    'Toad', 'Toucan', 'Walrus', 'Weasel', 'Wolf', 'Wombat', 'Yak',
    'Bison', 'Crab', 'Dingo', 'Eagle', 'Ferret', 'Gopher', 'Heron',
    'Iguana', 'Jaguar', 'Kestrel', 'Magpie', 'Newt', 'Osprey', 'Puffin', 'Quokka',
] as const;

function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** e.g. "RuthlessOtter", "SneakyQuokka" */
export function generateRandomName(): string {
    return `${pick(ADJECTIVES)}${pick(ANIMALS)}`;
}

/** Collision retry: "RuthlessOtter" → "RuthlessOtter42" */
export function withRandomSuffix(name: string): string {
    return `${name}${10 + Math.floor(Math.random() * 90)}`;
}
