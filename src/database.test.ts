import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { empty } from "./ledger";
test("database enforces authentication, RLS user isolation, and atomic conflict detection", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon; insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`,
    );
    await db.exec(await readFile("supabase/schema.sql", "utf8"));
    await db.exec(`set role anon`);
    await assert.rejects(
      db.query("select public.save_household($1::jsonb,0)", [
        JSON.stringify(empty()),
      ]),
    );
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'`,
    );
    const document = JSON.stringify(empty());
    let r = await db.query<{ save_household: number }>(
      "select public.save_household($1::jsonb,0)",
      [document],
    );
    assert.equal(r.rows[0].save_household, 1);
    r = await db.query("select public.save_household($1::jsonb,1)", [document]);
    assert.equal(r.rows[0].save_household, 2);
    await assert.rejects(
      db.query("select public.save_household($1::jsonb,1)", [document]),
      /another device/,
    );
    await assert.rejects(
      db.query("select public.save_household($1::jsonb,2)", [
        JSON.stringify({
          accounts: [],
          transactions: [{ amount: 0.5, type: "income" }],
          categories: [],
          bills: [],
          budgets: {},
        }),
      ]),
      /Invalid transaction/,
    );
    await assert.rejects(
      db.query("select public.save_household($1::jsonb,2)", ["{}"]),
      /Invalid household/,
    );
    await assert.rejects(
      db.query(`update households set data='{}'::jsonb`),
      /permission denied/,
    );
    await db.exec(
      `set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'`,
    );
    assert.equal((await db.query("select * from households")).rows.length, 0);
    await db.query("select public.save_household($1::jsonb,0)", [document]);
    assert.equal((await db.query("select * from households")).rows.length, 1);
    await db.exec(`reset role`);
    assert.equal((await db.query("select * from households")).rows.length, 2);
  } finally {
    await db.close();
  }
});
