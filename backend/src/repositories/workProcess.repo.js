import { supabase } from "../lib/supabase.js";

// Error codes save_work_process raises (or Postgres raises for it), surfaced as
// err.code so the service can turn them into user-facing responses.
const RAISED_CODES = [
  "process_limit_reached",
  "process_not_found",
  "exactly_one_fallback",
  "duplicate_destination_id",
  "destinations_must_be_array",
  "process_kind_immutable",
];

// Supabase caps every response at 1000 rows and truncates silently. A chunk of 10
// processes holds at most 10 × 21 destinations, so no chunk can come close.
const PROCESS_CHUNK = 10;

async function attachDestinations(processes) {
  if (processes.length === 0) return processes;

  const byProcess = new Map(processes.map((process) => [process.id, []]));
  for (let i = 0; i < processes.length; i += PROCESS_CHUNK) {
    const ids = processes.slice(i, i + PROCESS_CHUNK).map((process) => process.id);
    const { data, error } = await supabase
      .from("process_destinations")
      .select("*")
      .in("process_id", ids)
      .order("process_id", { ascending: true })
      .order("position", { ascending: true });

    if (error) throw new Error(`Failed to load process destinations: ${error.message}`);
    for (const destination of data ?? []) byProcess.get(destination.process_id)?.push(destination);
  }
  return processes.map((process) => ({ ...process, destinations: byProcess.get(process.id) ?? [] }));
}

/** All of a user's processes, oldest first (the order plan limits are applied in), with destinations. */
export async function listProcesses(userId) {
  const { data, error } = await supabase
    .from("work_processes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`Failed to load work processes: ${error.message}`);
  return attachDestinations(data ?? []);
}

/**
 * Creates (processId null) or updates a process and replaces its destination
 * list atomically. Throws with err.code set to a save_work_process code, or to
 * "duplicate_raw_folder" / "duplicate_destination_name" / "raw_is_master".
 */
export async function saveProcess(userId, processId, process, destinations, maxProcesses) {
  const { data, error } = await supabase.rpc("save_work_process", {
    p_user_id: userId,
    p_process_id: processId,
    p_process: process,
    p_destinations: destinations,
    p_max_processes: maxProcesses,
  });

  if (error) {
    const err = new Error(`Failed to save work process: ${error.message}`);
    err.code = RAISED_CODES.find((code) => error.message?.includes(code));
    if (!err.code && error.code === "23505") {
      err.code = /unique_raw/.test(error.message) ? "duplicate_raw_folder" : "duplicate_destination_name";
    }
    if (!err.code && error.code === "23514" && /raw_not_master/.test(error.message)) err.code = "raw_is_master";
    throw err;
  }
  return data;
}

export async function setEnabled(userId, processId, enabled) {
  const { data, error } = await supabase
    .from("work_processes")
    .update({ enabled })
    .eq("user_id", userId)
    .eq("id", processId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to update work process: ${error.message}`);
  return Boolean(data);
}

/** Destinations cascade; activity rows keep their destination_name snapshot. */
export async function deleteProcess(userId, processId) {
  const { data, error } = await supabase
    .from("work_processes")
    .delete()
    .eq("user_id", userId)
    .eq("id", processId)
    .select("id");

  if (error) throw new Error(`Failed to delete work process: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
