export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Fourteen";
export const APP_TIMEZONE = "America/Detroit";
export const SCHOOL_DOMAIN = "umich.edu";
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com";

export const CRUSH_MESSAGES = [
  "I've had a crush on you for a while now.",
  "I look for you every time I walk in.",
  "You make this school feel smaller in the best way.",
  "I think about our conversations after they end.",
  "I'd say yes if you asked.",
  "You're the reason I check who's going before I go.",
  "Somehow you're always the highlight.",
  "I like you. It's been distracting.",
  "If you guessed me, I'd be okay with it.",
  "You have no idea, and it's kind of killing me.",
  "My week gets better when you're in it.",
  "This is me being brave.",
] as const;

export const POLL_PROMPTS = [
  "Who'd text back at 3am?",
  "Who could talk their way out of a parking ticket?",
  "Who's secretly the funniest person you know?",
  "Who'd say yes to coffee right now?",
  "Who gives the best advice at 1am?",
  "Who'd survive longest in a horror movie?",
  "Who's most likely to end up a professor here?",
  "Who'd win campus-wide hide and seek?",
  "Who makes the dining hall bearable?",
  "Who do you want next to you in a group-project crisis?",
  "Who has the most contagious laugh?",
  "Who'd drop everything to get you from the airport?",
  "Who's going to be famous one day?",
  "Who'd plan the perfect surprise party?",
  "Who could DJ a party with zero notice?",
  "Who's the best study partner at 2am?",
  "Who'd share their fries without being asked?",
  "Who do you hope shows up when you walk in?",
  "Who'd win trivia night single-handedly?",
  "Who's most likely to befriend a campus squirrel?",
  "Who'd help you move in the rain?",
  "Who sends the funniest texts?",
  "Who'd you trust to cut your hair?",
  "Who makes 8am lectures survivable?",
] as const;

export const LOCAL_OTP_CODE = process.env.DEV_OTP_CODE || "140014";
export const SESSION_COOKIE = "fourteen_session";
export const ADMIN_COOKIE = "fourteen_founder";

export function formatDetroitDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
