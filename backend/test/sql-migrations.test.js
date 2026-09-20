// Run from backend/: node --test --experimental-test-module-mocks test/sql-migrations.test.js
//
// Applies the real supabase/migrations/*.sql files (0001 -> 0002 -> 0003 -> 0004 -> 0005
// -> 0004 -> 0005 again) against an in-memory PGlite Postgres and exercises the money-path
// SQL functions directly, the way the deployed backend calls them via supabase.rpc(...).
// No .env, no network, no real Supabase project.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDb, createUser, withRole, isPermissionDenied } from "./helpers/pglite.js";
import { PLAN_ORDER } from "../src/config/plans.js";

let db;
before(async () => {
  db = await createTestDb();
});
after(async () => {
  await db.close();
});

// ------------------------------------------------------------------------- fixtures

/** Inserts (or upserts) a subscriptions row with exactly the given columns. */
async function setSubscription(userId, fields = {}) {
  await db.query("insert into public.subscriptions (user_id) values ($1) on conflict (user_id) do nothing;", [
    userId,
  ]);
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  await db.query(`update public.subscriptions set ${setSql} where user_id = $1;`, [userId, ...cols.map((c) => fields[c])]);
}

async function getSubscription(userId) {
  const { rows } = await db.query("select * from public.subscriptions where user_id = $1;", [userId]);
  return rows[0];
}

/** Inserts a "processing" processed_files row (a claim) and returns its claimed_at token. */
async function claim(userId, fileId, kind = "image") {
  const { rows } = await db.query(
    "insert into public.processed_files (user_id, file_id, original_name, kind) values ($1, $2, $3, $4) returning claimed_at;",
    [userId, fileId, `${fileId}.bin`, kind],
  );
  return rows[0].claimed_at;
}

async function getProcessedFile(userId, fileId) {
  const { rows } = await db.query("select * from public.processed_files where user_id = $1 and file_id = $2;", [
    userId,
    fileId,
  ]);
  return rows[0];
}

/** Calls complete_processed_file_v2 with sane defaults, returning the bucket (or null). */
async function completeV2(userId, fileId, claimedAt, { kind, freeLimit = 0, monthlyLimit = 0, destinationId = null } = {}) {
  const { rows } = await db.query(
    `select public.complete_processed_file_v2($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as bucket;`,
    [
      userId,
      fileId,
      claimedAt,
      `renamed-${fileId}`,
      JSON.stringify({ tag: "t" }),
      destinationId,
      "Some Destination",
      kind,
      freeLimit,
      monthlyLimit,
    ],
  );
  return rows[0].bucket;
}

/** Calls the v1 complete_processed_file (9-arg, no kind) exactly as the currently deployed backend does. */
async function completeV1(userId, fileId, claimedAt, { freeLimit = 0, monthlyLimit = 0 } = {}) {
  const { rows } = await db.query(
    `select public.complete_processed_file($1, $2, $3, $4, $5, $6, $7, $8, $9) as bucket;`,
    [userId, fileId, claimedAt, `renamed-${fileId}`, JSON.stringify({ tag: "t" }), null, "Some Destination", freeLimit, monthlyLimit],
  );
  return rows[0].bucket;
}

function processPayload(overrides = {}) {
  return {
    name: "Test process",
    raw_folder_id: `raw-${randomUUID()}`,
    raw_folder_name: "Raw",
    master_folder_id: `master-${randomUUID()}`,
    master_folder_name: "Master",
    rename_template: "{destination}_{subject}",
    ...overrides,
  };
}

const oneFallback = [{ name: "Unsorted", folder_id: "dest-folder", is_fallback: true }];

async function saveWorkProcess(userId, processId, process, destinations, maxProcesses = 50) {
  const { rows } = await db.query(`select public.save_work_process($1, $2, $3, $4, $5) as id;`, [
    userId,
    processId,
    JSON.stringify(process),
    JSON.stringify(destinations),
    maxProcesses,
  ]);
  return rows[0].id;
}

async function getProcess(id) {
  const { rows } = await db.query("select * from public.work_processes where id = $1;", [id]);
  return rows[0];
}

// A stale sentinel period_start forces the "period rolled over" branch in complete_processed_file(_v2)
// and shows up as reset-to-0 counters from usage_snapshot / image_usage, regardless of what time the
// test actually runs at.
const STALE_PERIOD_START = "2000-01-01T00:00:00Z";
const STALE_PERIOD_START_MS = new Date(STALE_PERIOD_START).getTime();
// Date-vs-string formatting from the driver differs (e.g. trailing ".000"), so compare by
// timestamp value, not string equality.
const isStaleTimestamp = (value) => new Date(value).getTime() === STALE_PERIOD_START_MS;

// ---------------------------------------------------------------------------- v1

describe("complete_processed_file (v1, unchanged 9-arg signature)", () => {
  test("charges free -> monthly -> topup -> overage in order, same as before", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "free",
      period_anchor: new Date().toISOString(),
      period_start: new Date().toISOString(),
      free_images_used: 0,
      period_images_used: 0,
      topup_balance: 1,
    });

    const buckets = [];
    for (let i = 0; i < 4; i += 1) {
      const fileId = `v1-${userId}-${i}`;
      const claimedAt = await claim(userId, fileId);
      buckets.push(await completeV1(userId, fileId, claimedAt, { freeLimit: 1, monthlyLimit: 1 }));
    }

    assert.deepEqual(buckets, ["free", "monthly", "topup", "overage"]);
    const sub = await getSubscription(userId);
    assert.equal(sub.free_images_used, 1);
    assert.equal(sub.period_images_used, 2); // 1 real monthly charge + 1 overage counted into the period bucket
    assert.equal(sub.topup_balance, 0);
  });

  test("resets period_documents_used (as well as period_images_used) when the period rolls", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "creator",
      period_anchor: new Date().toISOString(),
      period_start: STALE_PERIOD_START, // forces the rollover branch
      period_images_used: 5,
      period_documents_used: 9,
      free_images_used: 0,
    });

    const fileId = `v1-roll-${userId}`;
    const claimedAt = await claim(userId, fileId);
    const bucket = await completeV1(userId, fileId, claimedAt, { freeLimit: 0, monthlyLimit: 1000 });

    assert.equal(bucket, "monthly");
    const sub = await getSubscription(userId);
    assert.ok(!isStaleTimestamp(sub.period_start), "period_start must have rolled forward");
    assert.equal(sub.period_images_used, 1, "rolled to 0 then charged this one file");
    assert.equal(sub.period_documents_used, 0, "the live backend never touches this column, but it must not carry a stale value across the roll");
  });

  test("never charges a failed file, and a lost claim returns null and records nothing", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, { free_images_used: 0 });
    const fileId = `v1-lost-${userId}`;
    await claim(userId, fileId);

    const bucket = await completeV1(userId, fileId, new Date(0).toISOString(), { freeLimit: 10, monthlyLimit: 10 });
    assert.equal(bucket, null);
    const sub = await getSubscription(userId);
    assert.equal(sub.free_images_used, 0);
    const row = await getProcessedFile(userId, fileId);
    assert.equal(row.status, "processing");
  });
});

// ---------------------------------------------------------------------------- v2

describe("complete_processed_file_v2", () => {
  test("charges images free -> monthly -> topup -> overage, touching only the image columns", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "creator",
      period_anchor: new Date().toISOString(),
      period_start: new Date().toISOString(),
      free_images_used: 0,
      period_images_used: 0,
      topup_balance: 1,
      free_documents_used: 0,
      period_documents_used: 0,
      document_topup_balance: 0,
    });

    const buckets = [];
    for (let i = 0; i < 4; i += 1) {
      const fileId = `v2-img-${userId}-${i}`;
      const claimedAt = await claim(userId, fileId, "image");
      buckets.push(await completeV2(userId, fileId, claimedAt, { kind: "image", freeLimit: 1, monthlyLimit: 1 }));
    }

    assert.deepEqual(buckets, ["free", "monthly", "topup", "overage"]);
    const sub = await getSubscription(userId);
    assert.equal(sub.free_images_used, 1);
    assert.equal(sub.period_images_used, 2);
    assert.equal(sub.topup_balance, 0);
    assert.equal(sub.free_documents_used, 0, "document columns must be untouched by an image charge");
    assert.equal(sub.period_documents_used, 0);
    assert.equal(sub.document_topup_balance, 0);

    const lastFile = await getProcessedFile(userId, `v2-img-${userId}-3`);
    assert.equal(lastFile.kind, "image");
    assert.equal(lastFile.status, "completed");
  });

  test("charges documents free -> monthly -> topup -> overage, touching only the document columns", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "docs-creator",
      period_anchor: new Date().toISOString(),
      period_start: new Date().toISOString(),
      free_images_used: 0,
      period_images_used: 0,
      topup_balance: 0,
      free_documents_used: 0,
      period_documents_used: 0,
      document_topup_balance: 1,
    });

    const buckets = [];
    for (let i = 0; i < 4; i += 1) {
      const fileId = `v2-doc-${userId}-${i}`;
      const claimedAt = await claim(userId, fileId, "document");
      buckets.push(await completeV2(userId, fileId, claimedAt, { kind: "document", freeLimit: 1, monthlyLimit: 1 }));
    }

    assert.deepEqual(buckets, ["free", "monthly", "topup", "overage"]);
    const sub = await getSubscription(userId);
    assert.equal(sub.free_documents_used, 1);
    assert.equal(sub.period_documents_used, 2);
    assert.equal(sub.document_topup_balance, 0);
    assert.equal(sub.free_images_used, 0, "image columns must be untouched by a document charge");
    assert.equal(sub.period_images_used, 0);
    assert.equal(sub.topup_balance, 0);

    const lastFile = await getProcessedFile(userId, `v2-doc-${userId}-3`);
    assert.equal(lastFile.kind, "document");
  });

  test("raises on an invalid kind, without touching any claim", async () => {
    const userId = await createUser(db);
    const fileId = `v2-badkind-${userId}`;
    const claimedAt = await claim(userId, fileId, "image");

    await assert.rejects(() => completeV2(userId, fileId, claimedAt, { kind: "video", freeLimit: 10, monthlyLimit: 10 }), /invalid_kind/);

    const row = await getProcessedFile(userId, fileId);
    assert.equal(row.status, "processing", "the claim must be untouched by a rejected call");
  });

  test("the claim fence: a stale/wrong claimed_at returns null and charges nothing", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, { free_images_used: 0 });
    const fileId = `v2-fence-${userId}`;
    await claim(userId, fileId, "image");

    const bucket = await completeV2(userId, fileId, new Date(0).toISOString(), { kind: "image", freeLimit: 10, monthlyLimit: 10 });
    assert.equal(bucket, null);
    const sub = await getSubscription(userId);
    assert.equal(sub.free_images_used, 0);
    const row = await getProcessedFile(userId, fileId);
    assert.equal(row.status, "processing");
  });

  test("rolls over and resets BOTH period counters, then charges only the kind being completed", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "complete-creator",
      period_anchor: new Date().toISOString(),
      period_start: STALE_PERIOD_START,
      period_images_used: 5,
      period_documents_used: 9,
      free_images_used: 0,
      free_documents_used: 0,
    });

    const fileId = `v2-roll-${userId}`;
    const claimedAt = await claim(userId, fileId, "document");
    const bucket = await completeV2(userId, fileId, claimedAt, { kind: "document", freeLimit: 0, monthlyLimit: 1000 });

    assert.equal(bucket, "monthly");
    const sub = await getSubscription(userId);
    assert.ok(!isStaleTimestamp(sub.period_start), "period_start must have rolled forward");
    assert.equal(sub.period_documents_used, 1, "rolled to 0 then charged this one document");
    assert.equal(sub.period_images_used, 0, "the image counter must also have rolled to 0, not stayed at 5");
  });
});

// -------------------------------------------------------------------- usage snapshots

describe("usage_snapshot / image_usage", () => {
  test("usage_snapshot returns both kinds and zeros out stale period counters", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "creator",
      status: "active",
      period_anchor: new Date().toISOString(),
      period_start: STALE_PERIOD_START,
      free_images_used: 3,
      period_images_used: 10,
      topup_balance: 5,
      free_documents_used: 4,
      period_documents_used: 20,
      document_topup_balance: 6,
    });

    const { rows } = await db.query("select * from public.usage_snapshot($1);", [userId]);
    const row = rows[0];
    assert.equal(row.plan, "creator");
    assert.equal(row.status, "active");
    assert.equal(row.free_images_used, 3, "non-period counters pass through unchanged");
    assert.equal(row.period_images_used, 0, "stale period counter shown as 0");
    assert.equal(row.topup_balance, 5);
    assert.equal(row.free_documents_used, 4);
    assert.equal(row.period_documents_used, 0, "stale period counter shown as 0");
    assert.equal(row.document_topup_balance, 6);
    assert.ok(!isStaleTimestamp(row.period_start), "period_start must have rolled forward");
  });

  test("image_usage (v1, untouched) still returns its original columns and values", async () => {
    const userId = await createUser(db);
    await setSubscription(userId, {
      plan: "studio",
      period_anchor: new Date().toISOString(),
      period_start: new Date().toISOString(),
      free_images_used: 2,
      period_images_used: 7,
      topup_balance: 9,
    });

    const { rows } = await db.query("select * from public.image_usage($1);", [userId]);
    const row = rows[0];
    assert.deepEqual(Object.keys(row).sort(), [
      "free_images_used",
      "period_end",
      "period_images_used",
      "period_start",
      "plan",
      "status",
      "topup_balance",
    ]);
    assert.equal(row.free_images_used, 2);
    assert.equal(row.period_images_used, 7);
    assert.equal(row.topup_balance, 9);
  });
});

// -------------------------------------------------------------------------- grants (credits)

describe("grant_credits / grant_image_credits / admin_grant_document_credits", () => {
  test("grant_credits adds and removes image top-up balance, logging each grant", async () => {
    const userId = await createUser(db);
    const b1 = await db.query("select public.grant_credits($1, 'image', 100, 'pack purchase') as b;", [userId]);
    assert.equal(b1.rows[0].b, 100);
    const b2 = await db.query("select public.grant_credits($1, 'image', -30, 'refund adjustment') as b;", [userId]);
    assert.equal(b2.rows[0].b, 70);

    const sub = await getSubscription(userId);
    assert.equal(sub.topup_balance, 70);

    const { rows: grants } = await db.query(
      "select kind, amount from public.image_credit_grants where user_id = $1 order by id;",
      [userId],
    );
    assert.deepEqual(grants, [
      { kind: "image", amount: 100 },
      { kind: "image", amount: -30 },
    ]);
  });

  test("grant_credits adds and removes document top-up balance independently of image balance", async () => {
    const userId = await createUser(db);
    await db.query("select public.grant_credits($1, 'image', 40, 'image pack') as b;", [userId]);
    const b = await db.query("select public.grant_credits($1, 'document', 200, 'docs pack') as b;", [userId]);
    assert.equal(b.rows[0].b, 200);

    const sub = await getSubscription(userId);
    assert.equal(sub.document_topup_balance, 200);
    assert.equal(sub.topup_balance, 40, "unaffected by the document grant");
  });

  test("a removal below zero violates the balance check and rolls back, including the log row", async () => {
    const userId = await createUser(db);
    await db.query("select public.grant_credits($1, 'document', 10, 'starter pack') as b;", [userId]);

    await assert.rejects(() => db.query("select public.grant_credits($1, 'document', -50, 'too much') as b;", [userId]));

    const sub = await getSubscription(userId);
    assert.equal(sub.document_topup_balance, 10, "balance must be unchanged by the failed removal");
    const { rows: grants } = await db.query(
      "select count(*)::int as n from public.image_credit_grants where user_id = $1 and reason = 'too much';",
      [userId],
    );
    assert.equal(grants[0].n, 0, "the failed grant's log row must have rolled back too");
  });

  test("an invalid kind raises and grants nothing", async () => {
    const userId = await createUser(db);
    await assert.rejects(() => db.query("select public.grant_credits($1, 'video', 10, 'bad kind') as b;", [userId]), /invalid_kind/);
  });

  test("provider_reference stays unique across grants (a payment webhook can only apply once)", async () => {
    const userId = await createUser(db);
    await db.query("select public.grant_credits($1, 'image', 100, 'first', 'purchase', 'order-1') as b;", [userId]);
    await assert.rejects(() =>
      db.query("select public.grant_credits($1, 'image', 100, 'duplicate webhook retry', 'purchase', 'order-1') as b;", [userId]),
    );
    const sub = await getSubscription(userId);
    assert.equal(sub.topup_balance, 100, "the duplicate must not have applied");
  });

  test("grant_image_credits delegates to grant_credits with kind = image", async () => {
    const userId = await createUser(db);
    const { rows } = await db.query("select public.grant_image_credits($1, 25, 'legacy caller') as b;", [userId]);
    assert.equal(rows[0].b, 25);
    const sub = await getSubscription(userId);
    assert.equal(sub.topup_balance, 25);
    const { rows: grants } = await db.query("select kind from public.image_credit_grants where user_id = $1;", [userId]);
    assert.equal(grants[0].kind, "image");
  });

  test("admin_grant_document_credits mirrors admin_grant_credits for documents", async () => {
    const email = `admin-doc-${randomUUID()}@example.com`;
    await createUser(db, email);
    const { rows } = await db.query("select public.admin_grant_document_credits($1, 250, 'invoice #1') as b;", [email]);
    assert.equal(rows[0].b, 250);
  });
});

// ----------------------------------------------------------------------- admin_set_plan

describe("admin_set_plan", () => {
  test("accepts every plan id in plans.js PLAN_ORDER", async () => {
    const email = `plans-${randomUUID()}@example.com`;
    await createUser(db, email);

    for (const planId of PLAN_ORDER) {
      // admin_set_plan returns public.subscriptions; "select * from fn(...)" expands its columns.
      const { rows } = await db.query("select * from public.admin_set_plan($1, $2);", [email, planId]);
      assert.equal(rows[0].plan, planId);
    }
  });

  test("rejects an unknown plan id", async () => {
    const email = `plans-bad-${randomUUID()}@example.com`;
    await createUser(db, email);
    await assert.rejects(() => db.query("select public.admin_set_plan($1, $2) as s;", [email, "not-a-real-plan"]));
  });

  test("resets both period counters on a plan change, but not on a same-plan call", async () => {
    const email = `plans-reset-${randomUUID()}@example.com`;
    const userId = await createUser(db, email);
    await db.query("select public.admin_set_plan($1, 'creator') as s;", [email]);
    await setSubscription(userId, { period_images_used: 12, period_documents_used: 34 });

    // Same plan again, no restart requested: counters must survive.
    await db.query("select public.admin_set_plan($1, 'creator') as s;", [email]);
    let sub = await getSubscription(userId);
    assert.equal(sub.period_images_used, 12);
    assert.equal(sub.period_documents_used, 34);

    // A different plan: both counters reset.
    await db.query("select public.admin_set_plan($1, 'studio') as s;", [email]);
    sub = await getSubscription(userId);
    assert.equal(sub.period_images_used, 0);
    assert.equal(sub.period_documents_used, 0);
  });
});

// -------------------------------------------------------------------- save_work_process

describe("save_work_process kind handling", () => {
  test("stores kind on insert, defaulting to image when absent", async () => {
    const userId = await createUser(db);
    const id = await saveWorkProcess(userId, null, processPayload({ kind: "document" }), oneFallback);
    assert.equal((await getProcess(id)).kind, "document");

    const id2 = await saveWorkProcess(userId, null, processPayload(), oneFallback); // no kind key at all
    assert.equal((await getProcess(id2)).kind, "image");
  });

  test("keeps the stored kind on an update that omits kind", async () => {
    const userId = await createUser(db);
    const id = await saveWorkProcess(userId, null, processPayload({ kind: "document" }), oneFallback);

    await saveWorkProcess(userId, id, processPayload({ name: "Renamed" }), oneFallback);
    const row = await getProcess(id);
    assert.equal(row.kind, "document", "kind must survive an update that doesn't mention it");
    assert.equal(row.name, "Renamed");
  });

  test("raises process_kind_immutable when an update's kind disagrees with the stored kind", async () => {
    const userId = await createUser(db);
    const id = await saveWorkProcess(userId, null, processPayload({ kind: "image" }), oneFallback);

    await assert.rejects(
      () => saveWorkProcess(userId, id, processPayload({ kind: "document" }), oneFallback),
      /process_kind_immutable/,
    );
    assert.equal((await getProcess(id)).kind, "image", "must be untouched by the rejected update");
  });

  test("an update that repeats the same kind is accepted", async () => {
    const userId = await createUser(db);
    const id = await saveWorkProcess(userId, null, processPayload({ kind: "document" }), oneFallback);
    await saveWorkProcess(userId, id, processPayload({ kind: "document", name: "Still docs" }), oneFallback);
    const row = await getProcess(id);
    assert.equal(row.kind, "document");
    assert.equal(row.name, "Still docs");
  });

  test("still enforces the process limit", async () => {
    const userId = await createUser(db);
    await saveWorkProcess(userId, null, processPayload(), oneFallback, 1);
    await assert.rejects(
      () => saveWorkProcess(userId, null, processPayload(), oneFallback, 1),
      /process_limit_reached/,
    );
  });

  test("still enforces exactly one fallback destination", async () => {
    const userId = await createUser(db);
    await assert.rejects(
      () => saveWorkProcess(userId, null, processPayload(), []),
      /exactly_one_fallback/,
    );
    await assert.rejects(
      () =>
        saveWorkProcess(userId, null, processPayload(), [
          { name: "A", folder_id: "fa", is_fallback: true },
          { name: "B", folder_id: "fb", is_fallback: true },
        ]),
      /exactly_one_fallback/,
    );
  });
});

// ------------------------------------------------------------------------------ grants

describe("function execute grants", () => {
  test("service_role can execute the new functions", async () => {
    const userId = await createUser(db);
    await withRole(db, "service_role", async () => {
      await db.query("select * from public.usage_snapshot($1);", [userId]);
      await db.query(
        "select public.complete_processed_file_v2($1, 'nofile', now(), 'x', '{}'::jsonb, null, null, 'image', 0, 0);",
        [userId],
      );
      await db.query("select public.grant_credits($1, 'image', 1, 'grant test');", [userId]);
    });
  });

  for (const role of ["anon", "authenticated"]) {
    test(`${role} cannot execute usage_snapshot, complete_processed_file_v2 or grant_credits`, async () => {
      const userId = await createUser(db);
      const denied1 = await withRole(db, role, () => isPermissionDenied(() => db.query("select * from public.usage_snapshot($1);", [userId])));
      assert.ok(denied1, "usage_snapshot must be denied");

      const denied2 = await withRole(db, role, () =>
        isPermissionDenied(() =>
          db.query(
            "select public.complete_processed_file_v2($1, 'nofile', now(), 'x', '{}'::jsonb, null, null, 'image', 0, 0);",
            [userId],
          ),
        ),
      );
      assert.ok(denied2, "complete_processed_file_v2 must be denied");

      const denied3 = await withRole(db, role, () =>
        isPermissionDenied(() => db.query("select public.grant_credits($1, 'image', 1, 'x');", [userId])),
      );
      assert.ok(denied3, "grant_credits must be denied");
    });
  }

  test("admin_grant_document_credits is not executable by service_role (owner-only)", async () => {
    const email = `admin-owneronly-${randomUUID()}@example.com`;
    await createUser(db, email);
    const denied = await withRole(db, "service_role", () =>
      isPermissionDenied(() => db.query("select public.admin_grant_document_credits($1, 1, 'x');", [email])),
    );
    assert.ok(denied);

    // The owner (default session role in this test, i.e. not anon/authenticated/service_role) can still call it.
    const { rows } = await db.query("select public.admin_grant_document_credits($1, 1, 'x') as b;", [email]);
    assert.equal(rows[0].b, 1);
  });
});

// --------------------------------------------------------------------------- idempotency

describe("0004 idempotency", () => {
  test("schema_migrations has exactly one row for 0004_documents after applying it twice", async () => {
    const { rows } = await db.query(
      "select count(*)::int as n from public.schema_migrations where version = '0004_documents';",
    );
    assert.equal(rows[0].n, 1);
  });
});

// ---------------------------------------------------------- grant_credits (0005 fix)

describe("grant_credits: readable insufficient_credits error (0005)", () => {
  test("removing more document credits than the balance raises insufficient_credits and changes nothing", async () => {
    const userId = await createUser(db);
    await db.query("select public.grant_credits($1, 'document', 100, 'starter pack') as b;", [userId]);

    await assert.rejects(
      () => db.query("select public.grant_credits($1, 'document', -250, 'refund, invoice #13') as b;", [userId]),
      /insufficient_credits/,
    );

    const sub = await getSubscription(userId);
    assert.equal(sub.document_topup_balance, 100, "balance must be unchanged by the refused removal");

    const { rows: grants } = await db.query(
      "select count(*)::int as n from public.image_credit_grants where user_id = $1 and reason = 'refund, invoice #13';",
      [userId],
    );
    assert.equal(grants[0].n, 0, "a refused grant must leave no audit row");
  });

  test("removing more image credits than the balance raises insufficient_credits and changes nothing", async () => {
    const userId = await createUser(db);
    await db.query("select public.grant_credits($1, 'image', 40, 'starter pack') as b;", [userId]);

    await assert.rejects(
      () => db.query("select public.grant_credits($1, 'image', -999, 'way too much') as b;", [userId]),
      /insufficient_credits/,
    );

    const sub = await getSubscription(userId);
    assert.equal(sub.topup_balance, 40, "balance must be unchanged by the refused removal");

    const { rows: grants } = await db.query(
      "select count(*)::int as n from public.image_credit_grants where user_id = $1 and reason = 'way too much';",
      [userId],
    );
    assert.equal(grants[0].n, 0, "a refused grant must leave no audit row");
  });

  test("removing exactly the whole balance succeeds and leaves 0", async () => {
    const userId = await createUser(db);
    await db.query("select public.grant_credits($1, 'document', 250, 'starter pack') as b;", [userId]);

    const { rows } = await db.query(
      "select public.grant_credits($1, 'document', -250, 'used it all') as b;",
      [userId],
    );
    assert.equal(rows[0].b, 0);

    const sub = await getSubscription(userId);
    assert.equal(sub.document_topup_balance, 0);
  });

  test("a positive grant still works and still logs", async () => {
    const userId = await createUser(db);
    const { rows } = await db.query("select public.grant_credits($1, 'image', 30, 'welcome pack') as b;", [userId]);
    assert.equal(rows[0].b, 30);

    const { rows: grants } = await db.query(
      "select amount from public.image_credit_grants where user_id = $1 and reason = 'welcome pack';",
      [userId],
    );
    assert.equal(grants.length, 1);
    assert.equal(grants[0].amount, 30);
  });
});

// ------------------------------------------------------------------------ beta_signups

describe("beta_signups", () => {
  test("a second insert with a different-cased email violates the unique index", async () => {
    await db.query("insert into public.beta_signups (email, name, consent_at) values ($1, $2, now());", [
      "case@example.com",
      "First",
    ]);

    await assert.rejects(() =>
      db.query("insert into public.beta_signups (email, name, consent_at) values ($1, $2, now());", [
        "Case@Example.com",
        "Second",
      ]),
    );
  });

  test("admin_mark_beta_added returns false for an unknown email, true + sets added_at for a known one", async () => {
    const { rows: unknown } = await db.query("select public.admin_mark_beta_added('nobody@example.com') as ok;");
    assert.equal(unknown[0].ok, false);

    await db.query("insert into public.beta_signups (email, name, consent_at) values ($1, $2, now());", [
      "known@example.com",
      "Known Person",
    ]);

    const { rows: known } = await db.query("select public.admin_mark_beta_added('KNOWN@example.com') as ok;");
    assert.equal(known[0].ok, true);

    const { rows: sig } = await db.query(
      "select added_to_google, added_at from public.beta_signups where email = $1;",
      ["known@example.com"],
    );
    assert.equal(sig[0].added_to_google, true);
    assert.ok(sig[0].added_at, "added_at must be set");
  });
});

// --------------------------------------------------------------------------- idempotency

describe("0005 idempotency", () => {
  test("schema_migrations has exactly one row for 0005_beta after applying it twice", async () => {
    const { rows } = await db.query(
      "select count(*)::int as n from public.schema_migrations where version = '0005_beta';",
    );
    assert.equal(rows[0].n, 1);
  });
});
