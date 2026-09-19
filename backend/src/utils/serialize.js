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
    // Rows saved before migration 0004 added the column have no kind; treat them as images.
    kind: row.kind ?? "image",
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

/** One kind's allowance: lifetime free, this billing period, and non-expiring packs. */
function serializeKindUsage(freeUsed, freeLimit, periodUsed, periodLimit, topupBalance, remaining) {
  return {
    freeUsed: freeUsed ?? 0,
    freeLimit,
    periodUsed: periodUsed ?? 0,
    periodLimit,
    topupBalance: topupBalance ?? 0,
    remaining,
    exhausted: remaining <= 0,
  };
}

/** Plan and usage for /api/me, from entitlement.service loadEntitlement(). Matches frontend/src/lib/api.ts's CurrentPlan/Usage/KindUsage. */
export function serializeEntitlement(entitlement) {
  if (!entitlement) return { plan: null, usage: null };
  const { plan, usage, credits } = entitlement;

  const images = serializeKindUsage(
    usage.free_images_used,
    plan.freeImages,
    usage.period_images_used,
    plan.monthlyImages,
    usage.topup_balance,
    credits.image,
  );
  const documents = serializeKindUsage(
    usage.free_documents_used,
    plan.freeDocuments,
    usage.period_documents_used,
    plan.monthlyDocuments,
    usage.document_topup_balance,
    credits.document,
  );

  return {
    plan: {
      id: plan.id,
      family: plan.family,
      label: plan.label,
      maxProcesses: plan.maxProcesses,
      aiPerProcess: plan.aiPerProcess,
      freeImages: plan.freeImages,
      freeDocuments: plan.freeDocuments,
      monthlyImages: plan.monthlyImages,
      monthlyDocuments: plan.monthlyDocuments,
    },
    usage: {
      status: usage.status,
      periodStart: usage.period_start,
      periodResetsAt: usage.period_end,
      images,
      documents,
      // Legacy flat fields (== images), for clients that predate documents.
      freeUsed: images.freeUsed,
      freeLimit: images.freeLimit,
      periodUsed: images.periodUsed,
      periodLimit: images.periodLimit,
      topupBalance: images.topupBalance,
      remaining: images.remaining,
      exhausted: images.exhausted,
    },
  };
}
