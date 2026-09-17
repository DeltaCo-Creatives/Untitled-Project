// API shapes are camelCase; repositories return snake_case rows.

/** Legacy single-folder shape, synthesized from the user's first process until the cleanup release. */
export function serializeLegacyFolderConfig(process) {
  if (!process) return null;
  return {
    rawFolderId: process.raw_folder_id,
    rawFolderName: process.raw_folder_name,
    destinationFolderId: process.master_folder_id,
    destinationFolderName: process.master_folder_name,
  };
}

export function serializeDestination(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    folderId: row.folder_id,
    folderName: row.folder_name,
    isFallback: Boolean(row.is_fallback),
    position: row.position,
  };
}

export function serializeProcess(row) {
  return {
    id: row.id,
    name: row.name,
    rawFolderId: row.raw_folder_id,
    rawFolderName: row.raw_folder_name,
    masterFolderId: row.master_folder_id,
    masterFolderName: row.master_folder_name,
    renameTemplate: row.rename_template,
    instructions: row.instructions ?? "",
    tagFields: Array.isArray(row.tag_fields) ? row.tag_fields : [],
    timezone: row.timezone,
    enabled: Boolean(row.enabled),
    locked: Boolean(row.locked),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    destinations: (row.destinations ?? []).map(serializeDestination),
  };
}

/** Plan and usage for /api/me, from entitlement.service loadEntitlement(). */
export function serializeEntitlement(entitlement) {
  if (!entitlement) return { plan: null, usage: null };
  const { plan, usage, credits } = entitlement;
  return {
    plan: {
      id: plan.id,
      label: plan.label,
      maxProcesses: plan.maxProcesses,
      freeImages: plan.freeImages,
      monthlyImages: plan.monthlyImages,
    },
    usage: {
      status: usage.status,
      freeUsed: usage.free_images_used,
      freeLimit: plan.freeImages,
      periodUsed: usage.period_images_used,
      periodLimit: plan.monthlyImages,
      periodStart: usage.period_start,
      periodResetsAt: usage.period_end,
      topupBalance: usage.topup_balance,
      remaining: credits,
      exhausted: credits <= 0,
    },
  };
}
