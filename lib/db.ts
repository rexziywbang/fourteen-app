import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { APP_TIMEZONE, CRUSH_MESSAGES, POLL_PROMPTS, formatDetroitDate } from "@/lib/constants";
import { buildHintLadder } from "@/lib/hints";
import { getContactProvider } from "@/lib/contact-provider";

export type SafeUser = {
  id: string;
  memberNumber: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  classYear: number | null;
  phone: string | null;
  isDemo: boolean;
  onboardingComplete: boolean;
  createdAt: string;
};

export type DirectoryPerson = {
  id: string;
  firstName: string;
  lastName: string;
  classYear: number;
  isDemo: boolean;
};

type DbGlobal = typeof globalThis & { __fourteenDb?: DatabaseSync };

function dbPath() {
  if (process.env.LOCAL_DB_PATH) return path.resolve(process.env.LOCAL_DB_PATH);
  return path.join(process.cwd(), ".data", "fourteen.sqlite");
}

function initialize(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      member_number INTEGER UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      class_year INTEGER,
      phone_e164 TEXT,
      phone_consent_at TEXT,
      is_over_18 INTEGER NOT NULL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      joined_month TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_active_at TEXT
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS circle_edges (
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, member_id),
      CHECK (owner_id <> member_id)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS crushes (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id INTEGER NOT NULL CHECK (message_id BETWEEN 1 AND 12),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suppressed','mutual','revealed','expired')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      correct_guess_at TEXT,
      consent_decision TEXT CHECK (consent_decision IN ('revealed','kept_hidden')),
      resolved_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS one_live_crush
      ON crushes(sender_id, recipient_id)
      WHERE status IN ('active','suppressed');

    CREATE TABLE IF NOT EXISTS crush_hints (
      crush_id TEXT NOT NULL REFERENCES crushes(id) ON DELETE CASCADE,
      day_index INTEGER NOT NULL CHECK (day_index BETWEEN 1 AND 14),
      hint_text TEXT NOT NULL,
      unlocked_at TEXT,
      PRIMARY KEY (crush_id, day_index)
    );

    CREATE TABLE IF NOT EXISTS crush_opens (
      crush_id TEXT NOT NULL REFERENCES crushes(id) ON DELETE CASCADE,
      open_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (crush_id, open_date)
    );

    CREATE TABLE IF NOT EXISTS guesses (
      id TEXT PRIMARY KEY,
      crush_id TEXT NOT NULL REFERENCES crushes(id) ON DELETE CASCADE,
      guessed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guess_date TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (crush_id, guess_date)
    );

    CREATE TABLE IF NOT EXISTS poll_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS poll_rounds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      round_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, round_date)
    );

    CREATE TABLE IF NOT EXISTS poll_cards (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES poll_rounds(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      prompt_id INTEGER NOT NULL REFERENCES poll_prompts(id),
      option_ids TEXT NOT NULL,
      picked_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      skipped INTEGER NOT NULL DEFAULT 0,
      answered_at TEXT,
      UNIQUE (round_id, position)
    );

    CREATE TABLE IF NOT EXISTS picks (
      id TEXT PRIMARY KEY,
      picker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      picked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prompt_id INTEGER NOT NULL REFERENCES poll_prompts(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      deliver_after TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_jobs (
      id TEXT PRIMARY KEY,
      crush_id TEXT UNIQUE NOT NULL REFERENCES crushes(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_phone TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','ai_phone')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','contacted','paused','failed')),
      message TEXT NOT NULL,
      deep_link TEXT NOT NULL,
      provider_reference TEXT,
      created_at TEXT NOT NULL,
      contacted_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      props TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, action, window_start)
    );
  `);

  const shouldSeed = process.env.SEED_DEMO_USERS !== "false" && process.env.NODE_ENV !== "production";
  seedContent(database);
  if (shouldSeed) seedDemoUsers(database);
}

function seedContent(database: DatabaseSync) {
  const statement = database.prepare("INSERT OR IGNORE INTO poll_prompts (text) VALUES (?)");
  for (const prompt of POLL_PROMPTS) statement.run(prompt);
}

function seedDemoUsers(database: DatabaseSync) {
  const now = new Date().toISOString();
  const demos = [
    ["bfe2bf22-7349-42ae-b450-854269604724", 9001, "demo.maya@umich.edu", "Maya", "Patel", 2028, "+17345550111"],
    ["68787870-3878-43da-8c5e-af61f31e1db7", 9002, "demo.noah@umich.edu", "Noah", "Kim", 2027, "+17345550122"],
    ["b9eeae31-3e09-4761-a8dd-9752ca647bd2", 9003, "demo.lena@umich.edu", "Lena", "Brooks", 2029, "+17345550133"],
    ["49e9a6f2-c970-469b-b592-f37a62a7aa04", 9004, "demo.eli@umich.edu", "Eli", "Rivera", 2028, "+17345550144"],
  ] as const;

  const statement = database.prepare(`
    INSERT OR IGNORE INTO users
      (id, member_number, email, first_name, last_name, class_year, phone_e164,
       phone_consent_at, is_over_18, onboarding_complete, is_demo, joined_month, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'August', ?)
  `);
  for (const demo of demos) statement.run(...demo, now, now);
}

export function getDb() {
  const globalState = globalThis as DbGlobal;
  if (!globalState.__fourteenDb) {
    const file = dbPath();
    mkdirSync(path.dirname(file), { recursive: true });
    globalState.__fourteenDb = new DatabaseSync(file);
    initialize(globalState.__fourteenDb);
  }
  return globalState.__fourteenDb;
}

function userFromRow(row: Record<string, unknown>): SafeUser {
  return {
    id: String(row.id),
    memberNumber: Number(row.member_number),
    email: String(row.email),
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    classYear: row.class_year ? Number(row.class_year) : null,
    phone: row.phone_e164 ? String(row.phone_e164) : null,
    isDemo: Boolean(row.is_demo),
    onboardingComplete: Boolean(row.onboarding_complete),
    createdAt: String(row.created_at),
  };
}

export function createOrFindSignup(email: string) {
  const database = getDb();
  const existing = database.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
  if (existing) return userFromRow(existing);
  const id = randomUUID();
  const nextNumber = Number(
    (database.prepare("SELECT COALESCE(MAX(member_number), 1000) + 1 AS next FROM users WHERE is_demo = 0").get() as { next: number }).next,
  );
  const now = new Date().toISOString();
  database
    .prepare(`INSERT INTO users (id, member_number, email, joined_month, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, nextNumber, email, formatDetroitDate(new Date()).split(" ")[0], now);
  logEvent(id, "signup", {});
  return getUserById(id)!;
}

export function getUserById(id: string) {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? userFromRow(row) : null;
}

export function getUserByEmail(email: string) {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
  return row ? userFromRow(row) : null;
}

export function saveOtp(email: string, codeHash: string) {
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  getDb()
    .prepare(`INSERT INTO otp_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`)
    .run(email, codeHash, expires);
}

export function getOtp(email: string) {
  return getDb().prepare("SELECT * FROM otp_codes WHERE email = ?").get(email) as
    | { email: string; code_hash: string; expires_at: string; attempts: number }
    | undefined;
}

export function incrementOtpAttempts(email: string) {
  getDb().prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?").run(email);
}

export function deleteOtp(email: string) {
  getDb().prepare("DELETE FROM otp_codes WHERE email = ?").run(email);
}

export function createSession(userId: string, tokenHash: string) {
  const now = new Date();
  getDb()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, userId, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString());
}

export function getSessionUser(tokenHash: string) {
  const row = getDb()
    .prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .get(tokenHash, new Date().toISOString()) as Record<string, unknown> | undefined;
  return row ? userFromRow(row) : null;
}

export function deleteSession(tokenHash: string) {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function completeOnboarding(input: {
  userId: string;
  firstName: string;
  lastName: string;
  classYear: number;
  phone: string;
  circleIds: string[];
}) {
  const database = getDb();
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(`UPDATE users SET first_name = ?, last_name = ?, class_year = ?, phone_e164 = ?,
        phone_consent_at = ?, is_over_18 = 1, onboarding_complete = 1, last_active_at = ? WHERE id = ?`)
      .run(input.firstName, input.lastName, input.classYear, input.phone, now, now, input.userId);
    const insertEdge = database.prepare(
      "INSERT OR IGNORE INTO circle_edges (owner_id, member_id, created_at) VALUES (?, ?, ?)",
    );
    for (const memberId of input.circleIds) insertEdge.run(input.userId, memberId, now);
    database.exec("COMMIT");
    logEvent(input.userId, "onboarded", { circle_size: input.circleIds.length });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function deleteUser(userId: string) {
  getDb().prepare("DELETE FROM users WHERE id = ? AND is_demo = 0").run(userId);
}

export function searchDirectory(userId: string, query: string) {
  const prefix = `${query.toLowerCase()}%`;
  const rows = getDb()
    .prepare(`SELECT id, first_name, last_name, class_year, is_demo FROM users
      WHERE id <> ? AND onboarding_complete = 1
        AND (lower(first_name) LIKE ? OR lower(last_name) LIKE ? OR lower(first_name || ' ' || last_name) LIKE ?)
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = users.id) OR (blocker_id = users.id AND blocked_id = ?))
      ORDER BY first_name, last_name LIMIT 8`)
    .all(userId, prefix, prefix, prefix, userId, userId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    classYear: Number(row.class_year),
    isDemo: Boolean(row.is_demo),
  })) satisfies DirectoryPerson[];
}

export function consumeRateLimit(userId: string, action: string, limit: number, windowSeconds: number) {
  const database = getDb();
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  database.prepare(`INSERT INTO rate_limits (user_id, action, window_start, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, action, window_start) DO UPDATE SET count = count + 1`).run(userId, action, windowStart);
  const row = database.prepare("SELECT count FROM rate_limits WHERE user_id = ? AND action = ? AND window_start = ?").get(userId, action, windowStart) as { count: number };
  return { allowed: Number(row.count) <= limit, retryAfter: windowStart + windowSeconds - Math.floor(Date.now() / 1000) };
}

export function suggestedPeople(userId: string) {
  const rows = getDb()
    .prepare(`SELECT id, first_name, last_name, class_year, is_demo FROM users
      WHERE id <> ? AND onboarding_complete = 1 AND is_demo = 1 ORDER BY first_name LIMIT 4`)
    .all(userId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    classYear: Number(row.class_year),
    isDemo: Boolean(row.is_demo),
  })) satisfies DirectoryPerson[];
}

export function getCircle(userId: string) {
  return getDb()
    .prepare(`SELECT u.id, u.first_name, u.last_name, u.class_year FROM circle_edges e
      JOIN users u ON u.id = e.member_id WHERE e.owner_id = ? ORDER BY u.first_name, u.last_name`)
    .all(userId) as Record<string, unknown>[];
}

function startOfIsoWeekDetroit() {
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  local.setHours(0, 0, 0, 0);
  return local.toISOString();
}

function detroitDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function enqueueNotification(database: DatabaseSync, userId: string, kind: string, payload: Record<string, unknown>, deliverAfter = new Date()) {
  database.prepare(`INSERT INTO notifications (id, user_id, kind, payload, deliver_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), userId, kind, JSON.stringify(payload), deliverAfter.toISOString(), new Date().toISOString());
}

function sweepExpiredCrushes(database: DatabaseSync) {
  const now = new Date();
  const expired = database.prepare("SELECT id, sender_id, status FROM crushes WHERE status IN ('active','suppressed') AND expires_at <= ?").all(now.toISOString()) as { id: string; sender_id: string; status: string }[];
  if (!expired.length) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    const update = database.prepare("UPDATE crushes SET status = 'expired', resolved_at = ? WHERE id = ?");
    for (const crush of expired) {
      update.run(now.toISOString(), crush.id);
      if (crush.status === "active") enqueueNotification(database, crush.sender_id, "quiet_close", { crush_id: crush.id });
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createCrush(senderId: string, recipientId: string, messageId: number) {
  const database = getDb();
  const sender = getUserById(senderId);
  const recipient = getUserById(recipientId);
  if (!sender?.onboardingComplete || !recipient?.onboardingComplete) throw new Error("Both people must finish onboarding.");
  if (senderId === recipientId) throw new Error("You cannot send a crush to yourself.");
  const weekly = database
    .prepare("SELECT COUNT(*) AS count FROM crushes WHERE sender_id = ? AND created_at >= ?")
    .get(senderId, startOfIsoWeekDetroit()) as { count: number };
  if (Number(weekly.count) > 0) throw new Error("Your one crush for this week is already in motion.");

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const id = randomUUID();
  const blocked = database
    .prepare("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)")
    .get(senderId, recipientId, recipientId, senderId);
  const reciprocal = !blocked
    ? database.prepare("SELECT id FROM crushes WHERE sender_id = ? AND recipient_id = ? AND status = 'active'").get(recipientId, senderId) as { id: string } | undefined
    : undefined;
  const status = blocked ? "suppressed" : reciprocal ? "mutual" : "active";

  const shared = database
    .prepare(`SELECT COUNT(*) AS count FROM circle_edges a JOIN circle_edges b ON a.member_id = b.member_id
      WHERE a.owner_id = ? AND b.owner_id = ?`)
    .get(senderId, recipientId) as { count: number };
  const senderHasRecipient = Boolean(database.prepare("SELECT 1 FROM circle_edges WHERE owner_id = ? AND member_id = ?").get(senderId, recipientId));
  const recipientHasSender = Boolean(database.prepare("SELECT 1 FROM circle_edges WHERE owner_id = ? AND member_id = ?").get(recipientId, senderId));
  const ladder = buildHintLadder(
    {
      firstName: sender.firstName!,
      lastName: sender.lastName!,
      classYear: sender.classYear!,
      joinedMonth: formatDetroitDate(new Date(sender.createdAt)).split(" ")[0],
      sharedCircleCount: Number(shared.count),
      senderHasRecipient,
      recipientHasSender,
      sentAt: now,
    },
    recipient.classYear!,
  );

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(`INSERT INTO crushes (id, sender_id, recipient_id, message_id, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, senderId, recipientId, messageId, status, now.toISOString(), expires.toISOString());
    const insertHint = database.prepare(
      "INSERT INTO crush_hints (crush_id, day_index, hint_text, unlocked_at) VALUES (?, ?, ?, ?)",
    );
    ladder.forEach((hint, index) => insertHint.run(id, index + 1, hint, index === 0 ? now.toISOString() : null));

    if (status === "mutual" && reciprocal) {
      database.prepare("UPDATE crushes SET status = 'mutual', resolved_at = ? WHERE id = ?").run(now.toISOString(), reciprocal.id);
      database.prepare("UPDATE crushes SET resolved_at = ? WHERE id = ?").run(now.toISOString(), id);
      enqueueNotification(database, senderId, "mutual_reveal", { crush_id: id });
      enqueueNotification(database, recipientId, "mutual_reveal", { crush_id: reciprocal.id });
    } else if (status === "active" && recipient.phone && !recipient.isDemo) {
      const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const provider = getContactProvider();
      const job = provider.createJob({
        crushId: id,
        recipientId,
        recipientPhone: recipient.phone,
        message: "Someone has a crush on you. Hint 1 of 14 is waiting.",
        deepLink: `${origin}/crush/${id}`,
      });
      database
        .prepare(`INSERT INTO contact_jobs
          (id, crush_id, recipient_id, recipient_phone, provider, status, message, deep_link, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), id, recipientId, recipient.phone, job.provider, job.status, job.message, job.deepLink, now.toISOString(), now.toISOString());
    }
    if (status === "active") enqueueNotification(database, recipientId, "crush_received", { crush_id: id });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  logEvent(senderId, "crush_sent", { crush_id: id, status });
  return id;
}

export function getHomeData(userId: string) {
  const database = getDb();
  sweepExpiredCrushes(database);
  const received = database
    .prepare(`SELECT c.id, c.message_id, c.status, c.created_at, c.expires_at,
      (SELECT COUNT(*) FROM crush_hints h WHERE h.crush_id = c.id AND h.unlocked_at IS NOT NULL) AS hints_unlocked
      FROM crushes c WHERE c.recipient_id = ? AND c.status <> 'suppressed' ORDER BY c.created_at DESC`)
    .all(userId) as Record<string, unknown>[];
  const sent = database
    .prepare(`SELECT c.id, c.message_id, c.status, c.created_at, c.expires_at,
      u.first_name AS recipient_first_name, u.last_name AS recipient_last_name,
      (SELECT COUNT(*) FROM crush_hints h WHERE h.crush_id = c.id AND h.unlocked_at IS NOT NULL) AS hints_unlocked
      FROM crushes c JOIN users u ON u.id = c.recipient_id WHERE c.sender_id = ? ORDER BY c.created_at DESC`)
    .all(userId) as Record<string, unknown>[];
  const circleCount = database.prepare("SELECT COUNT(*) AS count FROM circle_edges WHERE owner_id = ?").get(userId) as { count: number };
  return { received, sent, circleCount: Number(circleCount.count) };
}

export function getCrushForRecipient(userId: string, crushId: string) {
  const row = getDb()
    .prepare(`SELECT id, message_id, status, created_at, expires_at FROM crushes
      WHERE id = ? AND recipient_id = ? AND status <> 'suppressed'`)
    .get(crushId, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const hintRows = getDb()
    .prepare("SELECT day_index, hint_text, unlocked_at FROM crush_hints WHERE crush_id = ? ORDER BY day_index")
    .all(crushId) as Record<string, unknown>[];
  const guessesToday = Boolean(getDb().prepare("SELECT 1 FROM guesses WHERE crush_id = ? AND guess_date = ?").get(crushId, detroitDateKey()));
  return {
    id: String(row.id),
    messageId: Number(row.message_id),
    status: String(row.status),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    guessesToday,
    hints: hintRows.map((hint) => ({
      dayIndex: Number(hint.day_index),
      hintText: String(hint.hint_text),
      unlockedAt: hint.unlocked_at ? String(hint.unlocked_at) : null,
    })),
  };
}

export function getCrushForSender(userId: string, crushId: string) {
  const row = getDb()
    .prepare(`SELECT c.id, c.message_id, c.status, c.created_at, c.expires_at, c.correct_guess_at, c.consent_decision,
      u.first_name AS recipient_first_name, u.last_name AS recipient_last_name
      FROM crushes c JOIN users u ON u.id = c.recipient_id
      WHERE c.id = ? AND c.sender_id = ?`)
    .get(crushId, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const hintRows = getDb()
    .prepare("SELECT day_index, unlocked_at FROM crush_hints WHERE crush_id = ? ORDER BY day_index")
    .all(crushId) as Record<string, unknown>[];
  return {
    id: String(row.id),
    messageId: Number(row.message_id),
    status: String(row.status),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    correctGuessAt: row.correct_guess_at ? String(row.correct_guess_at) : null,
    consentDecision: row.consent_decision ? String(row.consent_decision) : null,
    recipientFirstName: String(row.recipient_first_name),
    recipientLastName: String(row.recipient_last_name),
    hints: hintRows.map((hint) => ({
      dayIndex: Number(hint.day_index),
      unlockedAt: hint.unlocked_at ? String(hint.unlocked_at) : null,
    })),
  };
}

export function openCrush(userId: string, crushId: string) {
  const database = getDb();
  const crush = database.prepare("SELECT sender_id, status FROM crushes WHERE id = ? AND recipient_id = ?").get(crushId, userId) as { sender_id: string; status: string } | undefined;
  if (!crush || crush.status !== "active") return;
  const now = new Date();
  const today = detroitDateKey(now);
  const inserted = database.prepare("INSERT OR IGNORE INTO crush_opens (crush_id, open_date, created_at) VALUES (?, ?, ?)").run(crushId, today, now.toISOString());
  if (!inserted.changes) return;
  const latest = database.prepare("SELECT day_index, unlocked_at FROM crush_hints WHERE crush_id = ? AND unlocked_at IS NOT NULL ORDER BY day_index DESC LIMIT 1").get(crushId) as { day_index: number; unlocked_at: string } | undefined;
  if (!latest || detroitDateKey(new Date(latest.unlocked_at)) === today || latest.day_index >= 14) return;
  const next = latest.day_index + 1;
  database.prepare("UPDATE crush_hints SET unlocked_at = ? WHERE crush_id = ? AND day_index = ?").run(now.toISOString(), crushId, next);
  enqueueNotification(database, crush.sender_id, "fuse_progress", { crush_id: crushId, hint_number: next });
  logEvent(userId, "hint_unlocked", { crush_id: crushId, hint_number: next });
}

export function submitGuess(userId: string, crushId: string, guessedId: string) {
  const database = getDb();
  const crush = database.prepare("SELECT sender_id, status, correct_guess_at FROM crushes WHERE id = ? AND recipient_id = ?").get(crushId, userId) as { sender_id: string; status: string; correct_guess_at: string | null } | undefined;
  const guessedExists = database.prepare("SELECT id FROM users WHERE id = ? AND onboarding_complete = 1").get(guessedId);
  const today = detroitDateKey();
  const existing = database.prepare("SELECT id FROM guesses WHERE crush_id = ? AND guess_date = ?").get(crushId, today);
  const isCorrect = Boolean(crush && guessedExists && crush.sender_id === guessedId);
  if (crush?.status === "active" && guessedExists && !existing) {
    const now = new Date();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`INSERT INTO guesses (id, crush_id, guessed_id, guess_date, is_correct, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), crushId, guessedId, today, isCorrect ? 1 : 0, now.toISOString());
      if (isCorrect && !crush.correct_guess_at) {
        database.prepare("UPDATE crushes SET correct_guess_at = ? WHERE id = ?").run(now.toISOString(), crushId);
        enqueueNotification(database, crush.sender_id, "consent_prompt", { crush_id: crushId });
      }
      enqueueNotification(database, crush.sender_id, "guess_made", { crush_id: crushId, is_correct: isCorrect });
      database.exec("COMMIT");
      logEvent(userId, "guess_submitted", { crush_id: crushId });
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  return "recorded" as const;
}

export function consentReveal(userId: string, crushId: string, decision: "revealed" | "kept_hidden") {
  const database = getDb();
  const crush = database.prepare("SELECT recipient_id, status, correct_guess_at FROM crushes WHERE id = ? AND sender_id = ?").get(crushId, userId) as { recipient_id: string; status: string; correct_guess_at: string | null } | undefined;
  if (!crush || crush.status !== "active" || !crush.correct_guess_at) throw new Error("This reveal choice is no longer available.");
  const now = new Date();
  if (decision === "revealed") {
    database.prepare("UPDATE crushes SET status = 'revealed', consent_decision = 'revealed', resolved_at = ? WHERE id = ?").run(now.toISOString(), crushId);
    enqueueNotification(database, crush.recipient_id, "identity_revealed", { crush_id: crushId });
    logEvent(userId, "reveal_consented", { crush_id: crushId });
  } else {
    database.prepare("UPDATE crushes SET consent_decision = 'kept_hidden' WHERE id = ?").run(crushId);
  }
}

export function getReveal(userId: string, crushId: string) {
  const row = getDb().prepare(`SELECT c.id, c.status, c.resolved_at,
    sender.id AS sender_id, sender.first_name AS sender_first_name,
    recipient.id AS recipient_id, recipient.first_name AS recipient_first_name
    FROM crushes c JOIN users sender ON sender.id = c.sender_id JOIN users recipient ON recipient.id = c.recipient_id
    WHERE c.id = ? AND c.status IN ('mutual','revealed') AND ? IN (c.sender_id, c.recipient_id)`)
    .get(crushId, userId) as Record<string, unknown> | undefined;
  return row || null;
}

function createRound(database: DatabaseSync, userId: string, roundDate: string, people: Record<string, unknown>[]) {
  const roundId = randomUUID();
  const now = new Date().toISOString();
  database.prepare("INSERT INTO poll_rounds (id, user_id, round_date, created_at) VALUES (?, ?, ?, ?)").run(roundId, userId, roundDate, now);
  const prompts = database.prepare("SELECT id FROM poll_prompts WHERE active = 1 ORDER BY id").all() as { id: number }[];
  const dayOffset = Number(roundDate.replaceAll("-", "")) % prompts.length;
  const insertCard = database.prepare("INSERT INTO poll_cards (id, round_id, position, prompt_id, option_ids) VALUES (?, ?, ?, ?, ?)");
  for (let position = 0; position < 6; position += 1) {
    const options = Array.from({ length: 4 }, (_, index) => String(people[(position * 2 + index) % people.length].id));
    insertCard.run(randomUUID(), roundId, position, prompts[(dayOffset + position) % prompts.length].id, JSON.stringify(options));
  }
  return roundId;
}

export function getTodayRound(userId: string) {
  const database = getDb();
  const people = getCircle(userId);
  if (people.length < 4) return { locked: true as const, circleCount: people.length };
  const roundDate = detroitDateKey();
  let round = database.prepare("SELECT id FROM poll_rounds WHERE user_id = ? AND round_date = ?").get(userId, roundDate) as { id: string } | undefined;
  if (!round) round = { id: createRound(database, userId, roundDate, people) };
  const cards = database.prepare(`SELECT c.id, c.position, c.option_ids, c.picked_id, c.skipped, c.answered_at, p.text AS prompt_text
    FROM poll_cards c JOIN poll_prompts p ON p.id = c.prompt_id WHERE c.round_id = ? ORDER BY c.position`).all(round.id) as Record<string, unknown>[];
  const current = cards.find((card) => !card.answered_at);
  if (!current) return { locked: false as const, complete: true as const, answered: cards.length, total: cards.length };
  const optionIds = JSON.parse(String(current.option_ids)) as string[];
  const placeholders = optionIds.map(() => "?").join(",");
  const options = database.prepare(`SELECT id, first_name, last_name, class_year FROM users WHERE id IN (${placeholders})`).all(...optionIds) as Record<string, unknown>[];
  const orderedOptions = optionIds.map((id) => options.find((option) => option.id === id)!).filter(Boolean).map((option) => ({ id: String(option.id), firstName: String(option.first_name), lastName: String(option.last_name), classYear: Number(option.class_year) }));
  return { locked: false as const, complete: false as const, answered: Number(current.position), total: cards.length, card: { id: String(current.id), prompt: String(current.prompt_text), options: orderedOptions } };
}

export function answerPollCard(userId: string, cardId: string, pickedId: string | null) {
  const database = getDb();
  const card = database.prepare(`SELECT c.id, c.option_ids, c.answered_at, c.prompt_id, r.id AS round_id
    FROM poll_cards c JOIN poll_rounds r ON r.id = c.round_id WHERE c.id = ? AND r.user_id = ?`).get(cardId, userId) as { id: string; option_ids: string; answered_at: string | null; prompt_id: number; round_id: string } | undefined;
  if (!card || card.answered_at) return;
  const optionIds = JSON.parse(card.option_ids) as string[];
  if (pickedId && !optionIds.includes(pickedId)) throw new Error("That person is not on this card.");
  const now = new Date();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE poll_cards SET picked_id = ?, skipped = ?, answered_at = ? WHERE id = ?")
      .run(pickedId, pickedId ? 0 : 1, now.toISOString(), cardId);
    if (pickedId) {
      database.prepare("INSERT INTO picks (id, picker_id, picked_id, prompt_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(randomUUID(), userId, pickedId, card.prompt_id, now.toISOString());
      const delayMinutes = 30 + Math.floor(Math.random() * 61);
      enqueueNotification(database, pickedId, "poll_pick", { prompt_id: card.prompt_id }, new Date(now.getTime() + delayMinutes * 60_000));
    }
    database.exec("COMMIT");
    if (pickedId) logEvent(userId, "pick_made", { card_id: cardId });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const remaining = database.prepare("SELECT COUNT(*) AS count FROM poll_cards WHERE round_id = ? AND answered_at IS NULL").get(card.round_id) as { count: number };
  if (Number(remaining.count) === 0) logEvent(userId, "round_completed", { round_id: card.round_id });
}

export function getCompliments(userId: string) {
  return getDb().prepare(`SELECT p.id, pp.text AS prompt_text, p.created_at FROM picks p
    JOIN poll_prompts pp ON pp.id = p.prompt_id WHERE p.picked_id = ? ORDER BY p.created_at DESC LIMIT 20`).all(userId) as Record<string, unknown>[];
}

export function getNotifications(userId: string) {
  const rows = getDb().prepare("SELECT id, kind, payload, created_at FROM notifications WHERE user_id = ? AND deliver_after <= ? ORDER BY created_at DESC LIMIT 20").all(userId, new Date().toISOString()) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    createdAt: String(row.created_at),
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
  }));
}

export function submitReport(userId: string, reason: string) {
  const cleaned = reason.trim();
  if (!cleaned || cleaned.length > 500) throw new Error("Reports must be between 1 and 500 characters.");
  getDb().prepare("INSERT INTO reports (id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)").run(randomUUID(), userId, cleaned, new Date().toISOString());
}

export function getReportHistory(userId: string) {
  return getDb().prepare("SELECT id, created_at, resolved_at FROM reports WHERE reporter_id = ? ORDER BY created_at DESC").all(userId) as Record<string, unknown>[];
}

export function getFounderDashboard() {
  const database = getDb();
  const totals = database.prepare(`SELECT
    (SELECT COUNT(*) FROM users WHERE is_demo = 0) AS users,
    (SELECT COUNT(*) FROM users WHERE is_demo = 0 AND onboarding_complete = 1) AS onboarded,
    (SELECT COUNT(*) FROM crushes) AS crushes,
    (SELECT COUNT(*) FROM contact_jobs WHERE status = 'queued') AS queued`).get() as Record<string, number>;
  const users = database
    .prepare(`SELECT member_number, email, first_name, last_name, class_year, phone_e164,
      phone_consent_at, onboarding_complete, created_at FROM users WHERE is_demo = 0 ORDER BY created_at DESC`)
    .all() as Record<string, unknown>[];
  const jobs = database
    .prepare(`SELECT j.id, j.status, j.provider, j.recipient_phone, j.message, j.deep_link, j.created_at, j.contacted_at,
      sender.member_number AS sender_number, sender.first_name AS sender_first_name, sender.email AS sender_email,
      recipient.member_number AS recipient_number, recipient.first_name AS recipient_first_name,
      recipient.last_name AS recipient_last_name, recipient.email AS recipient_email,
      c.status AS crush_status
      FROM contact_jobs j
      JOIN crushes c ON c.id = j.crush_id
      JOIN users sender ON sender.id = c.sender_id
      JOIN users recipient ON recipient.id = c.recipient_id
      ORDER BY CASE j.status WHEN 'queued' THEN 0 ELSE 1 END, j.created_at DESC`)
    .all() as Record<string, unknown>[];
  const reports = database.prepare(`SELECT r.id, r.reason, r.created_at, r.resolved_at,
    u.member_number, u.first_name, u.last_name, u.email
    FROM reports r JOIN users u ON u.id = r.reporter_id
    ORDER BY r.resolved_at IS NOT NULL, r.created_at DESC`).all() as Record<string, unknown>[];
  return { totals, users, jobs, reports };
}

export function setContactJobStatus(jobId: string, status: "queued" | "contacted" | "paused") {
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE contact_jobs SET status = ?, contacted_at = CASE WHEN ? = 'contacted' THEN ? ELSE contacted_at END, updated_at = ? WHERE id = ?")
    .run(status, status, now, now, jobId);
  auditAdmin("contact_job_status_changed", "contact_job", jobId, { status });
}

export function resolveReport(reportId: string) {
  getDb().prepare("UPDATE reports SET resolved_at = COALESCE(resolved_at, ?) WHERE id = ?").run(new Date().toISOString(), reportId);
  auditAdmin("report_resolved", "report", reportId, {});
}

export function logEvent(userId: string | null, name: string, props: Record<string, unknown>) {
  getDb()
    .prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, name, JSON.stringify(props), new Date().toISOString());
}

export function auditAdmin(action: string, objectType: string, objectId: string | null, details: Record<string, unknown>) {
  getDb()
    .prepare("INSERT INTO admin_audit_log (action, object_type, object_id, details, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(action, objectType, objectId, JSON.stringify(details), new Date().toISOString());
}

export function deleteAccount(userId: string) {
  deleteUser(userId);
}

export function getCrushMessage(messageId: number) {
  return CRUSH_MESSAGES[messageId - 1] || CRUSH_MESSAGES[0];
}
