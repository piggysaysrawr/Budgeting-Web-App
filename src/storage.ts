import { createClient } from "@supabase/supabase-js";
import { type Data, empty } from "./ledger";
const env = (import.meta as unknown as { env: Record<string, string> }).env;
export const cloud =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    : null;
export async function load(user: string) {
  const { data, error } = await cloud!
    .from("households")
    .select("data,revision")
    .eq("user_id", user)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { data: data.data as Data, revision: data.revision as number }
    : { data: empty(), revision: 0 };
}
export async function save(user: string, data: Data, revision: number) {
  const result = await cloud!.rpc("save_household", {
    document: data,
    expected_revision: revision,
  });
  if (result.error) throw result.error;
  return result.data as number;
}
