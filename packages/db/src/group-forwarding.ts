import { jstNow, toJstString } from './utils.js';

export type GroupForwardRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'failed';

export interface GroupForwardRuleRow {
  id: string;
  line_account_id: string | null;
  name: string;
  source_group_id: string;
  target_group_id: string;
  approver_user_id: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GroupForwardRequestRow {
  id: string;
  approval_code: string;
  rule_id: string;
  rule_name?: string | null;
  line_account_id: string | null;
  source_group_id: string;
  target_group_id: string;
  approver_user_id: string;
  source_user_id: string | null;
  line_message_id: string;
  message_text: string;
  status: GroupForwardRequestStatus;
  expires_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  forwarded_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGroupForwardRuleInput {
  lineAccountId?: string | null;
  name: string;
  sourceGroupId: string;
  targetGroupId: string;
  approverUserId: string;
}

export interface UpdateGroupForwardRuleInput {
  lineAccountId?: string | null;
  name?: string;
  sourceGroupId?: string;
  targetGroupId?: string;
  approverUserId?: string;
  isActive?: boolean;
}

export interface CreateGroupForwardRequestInput {
  ruleId: string;
  lineAccountId?: string | null;
  sourceGroupId: string;
  targetGroupId: string;
  approverUserId: string;
  sourceUserId?: string | null;
  lineMessageId: string;
  messageText: string;
  expiresAt?: string;
}

export type CreateGroupForwardRequestResult =
  | { status: 'created'; request: GroupForwardRequestRow }
  | { status: 'duplicate'; request: GroupForwardRequestRow | null };

const APPROVAL_CODE_RETRIES = 8;

function isUniqueConstraintError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}

function isApprovalCodeUniqueError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /group_forward_requests\.approval_code/i.test(message);
}

function generateApprovalCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

export function groupForwardExpiresAtFromNow(minutes = 30): string {
  return toJstString(new Date(Date.now() + minutes * 60_000));
}

export async function getGroupForwardRules(
  db: D1Database,
  lineAccountId?: string,
): Promise<GroupForwardRuleRow[]> {
  if (lineAccountId) {
    const result = await db
      .prepare(
        `SELECT * FROM group_forward_rules
         WHERE line_account_id IS NULL OR line_account_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(lineAccountId)
      .all<GroupForwardRuleRow>();
    return result.results;
  }

  const result = await db
    .prepare(`SELECT * FROM group_forward_rules ORDER BY created_at DESC`)
    .all<GroupForwardRuleRow>();
  return result.results;
}

export async function getGroupForwardRuleById(
  db: D1Database,
  id: string,
): Promise<GroupForwardRuleRow | null> {
  return db
    .prepare(`SELECT * FROM group_forward_rules WHERE id = ?`)
    .bind(id)
    .first<GroupForwardRuleRow>();
}

export async function getActiveGroupForwardRuleBySourceGroupId(
  db: D1Database,
  sourceGroupId: string,
  lineAccountId?: string | null,
): Promise<GroupForwardRuleRow | null> {
  if (lineAccountId) {
    return db
      .prepare(
        `SELECT * FROM group_forward_rules
         WHERE source_group_id = ?
           AND is_active = 1
           AND (line_account_id IS NULL OR line_account_id = ?)
         ORDER BY line_account_id DESC, created_at ASC
         LIMIT 1`,
      )
      .bind(sourceGroupId, lineAccountId)
      .first<GroupForwardRuleRow>();
  }

  return db
    .prepare(
      `SELECT * FROM group_forward_rules
       WHERE source_group_id = ? AND is_active = 1
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(sourceGroupId)
    .first<GroupForwardRuleRow>();
}

export async function createGroupForwardRule(
  db: D1Database,
  input: CreateGroupForwardRuleInput,
): Promise<GroupForwardRuleRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO group_forward_rules
         (id, line_account_id, name, source_group_id, target_group_id,
          approver_user_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      input.lineAccountId ?? null,
      input.name,
      input.sourceGroupId,
      input.targetGroupId,
      input.approverUserId,
      now,
      now,
    )
    .run();

  return (await getGroupForwardRuleById(db, id))!;
}

export async function updateGroupForwardRule(
  db: D1Database,
  id: string,
  input: UpdateGroupForwardRuleInput,
): Promise<GroupForwardRuleRow | null> {
  const existing = await getGroupForwardRuleById(db, id);
  if (!existing) return null;

  const now = jstNow();
  await db
    .prepare(
      `UPDATE group_forward_rules
       SET line_account_id = ?,
           name = ?,
           source_group_id = ?,
           target_group_id = ?,
           approver_user_id = ?,
           is_active = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      'lineAccountId' in input ? (input.lineAccountId ?? null) : existing.line_account_id,
      input.name ?? existing.name,
      input.sourceGroupId ?? existing.source_group_id,
      input.targetGroupId ?? existing.target_group_id,
      input.approverUserId ?? existing.approver_user_id,
      'isActive' in input ? (input.isActive ? 1 : 0) : existing.is_active,
      now,
      id,
    )
    .run();

  return getGroupForwardRuleById(db, id);
}

export async function deleteGroupForwardRule(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM group_forward_rules WHERE id = ?`).bind(id).run();
}

export async function getGroupForwardRequestByApprovalCode(
  db: D1Database,
  approvalCode: string,
): Promise<GroupForwardRequestRow | null> {
  return db
    .prepare(`SELECT * FROM group_forward_requests WHERE approval_code = ?`)
    .bind(approvalCode)
    .first<GroupForwardRequestRow>();
}

export async function getPendingGroupForwardRequestForApprover(
  db: D1Database,
  approverUserId: string,
  approvalCode: string,
): Promise<GroupForwardRequestRow | null> {
  return db
    .prepare(
      `SELECT * FROM group_forward_requests
       WHERE approver_user_id = ? AND approval_code = ? AND status = 'pending'`,
    )
    .bind(approverUserId, approvalCode)
    .first<GroupForwardRequestRow>();
}

export async function getGroupForwardRequestByLineMessageId(
  db: D1Database,
  lineMessageId: string,
): Promise<GroupForwardRequestRow | null> {
  return db
    .prepare(`SELECT * FROM group_forward_requests WHERE line_message_id = ?`)
    .bind(lineMessageId)
    .first<GroupForwardRequestRow>();
}

export async function createGroupForwardRequest(
  db: D1Database,
  input: CreateGroupForwardRequestInput,
): Promise<CreateGroupForwardRequestResult> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const expiresAt = input.expiresAt ?? groupForwardExpiresAtFromNow(30);

  for (let attempt = 0; attempt < APPROVAL_CODE_RETRIES; attempt++) {
    const approvalCode = generateApprovalCode();
    try {
      await db
        .prepare(
          `INSERT INTO group_forward_requests
             (id, approval_code, rule_id, line_account_id, source_group_id,
              target_group_id, approver_user_id, source_user_id, line_message_id,
              message_text, status, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        )
        .bind(
          id,
          approvalCode,
          input.ruleId,
          input.lineAccountId ?? null,
          input.sourceGroupId,
          input.targetGroupId,
          input.approverUserId,
          input.sourceUserId ?? null,
          input.lineMessageId,
          input.messageText,
          expiresAt,
          now,
          now,
        )
        .run();

      return {
        status: 'created',
        request: (await getGroupForwardRequestByApprovalCode(db, approvalCode))!,
      };
    } catch (err) {
      if (isUniqueConstraintError(err) && !isApprovalCodeUniqueError(err)) {
        return {
          status: 'duplicate',
          request: await getGroupForwardRequestByLineMessageId(db, input.lineMessageId),
        };
      }
      if (isApprovalCodeUniqueError(err) && attempt < APPROVAL_CODE_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed to generate unique approval code');
}

export async function listGroupForwardRequests(
  db: D1Database,
  params?: { status?: GroupForwardRequestStatus; lineAccountId?: string; limit?: number },
): Promise<GroupForwardRequestRow[]> {
  const limit = Math.min(Math.max(params?.limit ?? 100, 1), 500);
  if (params?.status && params.lineAccountId) {
    const result = await db
      .prepare(
        `SELECT r.*, rules.name AS rule_name
         FROM group_forward_requests r
         LEFT JOIN group_forward_rules rules ON rules.id = r.rule_id
         WHERE r.status = ? AND (r.line_account_id IS NULL OR r.line_account_id = ?)
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .bind(params.status, params.lineAccountId, limit)
      .all<GroupForwardRequestRow>();
    return result.results;
  }

  if (params?.status) {
    const result = await db
      .prepare(
        `SELECT r.*, rules.name AS rule_name
         FROM group_forward_requests r
         LEFT JOIN group_forward_rules rules ON rules.id = r.rule_id
         WHERE r.status = ?
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .bind(params.status, limit)
      .all<GroupForwardRequestRow>();
    return result.results;
  }

  if (params?.lineAccountId) {
    const result = await db
      .prepare(
        `SELECT r.*, rules.name AS rule_name
         FROM group_forward_requests r
         LEFT JOIN group_forward_rules rules ON rules.id = r.rule_id
         WHERE r.line_account_id IS NULL OR r.line_account_id = ?
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .bind(params.lineAccountId, limit)
      .all<GroupForwardRequestRow>();
    return result.results;
  }

  const result = await db
    .prepare(
      `SELECT r.*, rules.name AS rule_name
       FROM group_forward_requests r
       LEFT JOIN group_forward_rules rules ON rules.id = r.rule_id
       ORDER BY r.created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<GroupForwardRequestRow>();
  return result.results;
}

export async function approvePendingGroupForwardRequest(
  db: D1Database,
  id: string,
  now = jstNow(),
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE group_forward_requests
       SET status = 'approved', approved_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending' AND expires_at > ?`,
    )
    .bind(now, now, id, now)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function markGroupForwardRequestForwarded(
  db: D1Database,
  id: string,
  now = jstNow(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE group_forward_requests
       SET forwarded_at = ?, updated_at = ?
       WHERE id = ? AND status = 'approved'`,
    )
    .bind(now, now, id)
    .run();
}

export async function rejectPendingGroupForwardRequest(
  db: D1Database,
  id: string,
  now = jstNow(),
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE group_forward_requests
       SET status = 'rejected', rejected_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending' AND expires_at > ?`,
    )
    .bind(now, now, id, now)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function markGroupForwardRequestExpired(
  db: D1Database,
  id: string,
  now = jstNow(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE group_forward_requests
       SET status = 'expired', updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, id)
    .run();
}

export async function markGroupForwardRequestFailed(
  db: D1Database,
  id: string,
  reason: string,
  now = jstNow(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE group_forward_requests
       SET status = 'failed', failure_reason = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(reason.slice(0, 1000), now, id)
    .run();
}
