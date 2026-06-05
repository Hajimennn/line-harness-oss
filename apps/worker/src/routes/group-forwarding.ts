import { Hono } from 'hono';
import {
  createGroupForwardRule,
  deleteGroupForwardRule,
  getGroupForwardRuleById,
  getGroupForwardRules,
  listGroupForwardRequests,
  updateGroupForwardRule,
} from '@line-crm/db';
import type { GroupForwardRequestRow, GroupForwardRequestStatus, GroupForwardRuleRow } from '@line-crm/db';
import type { Env } from '../index.js';

const groupForwarding = new Hono<Env>();

function serializeRule(row: GroupForwardRuleRow) {
  return {
    id: row.id,
    lineAccountId: row.line_account_id,
    name: row.name,
    sourceGroupId: row.source_group_id,
    targetGroupId: row.target_group_id,
    approverUserId: row.approver_user_id,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRequest(row: GroupForwardRequestRow) {
  return {
    id: row.id,
    approvalCode: row.approval_code,
    ruleId: row.rule_id,
    ruleName: row.rule_name ?? null,
    lineAccountId: row.line_account_id,
    sourceGroupId: row.source_group_id,
    targetGroupId: row.target_group_id,
    approverUserId: row.approver_user_id,
    sourceUserId: row.source_user_id,
    lineMessageId: row.line_message_id,
    messageText: row.message_text,
    status: row.status,
    expiresAt: row.expires_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    forwardedAt: row.forwarded_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

groupForwarding.get('/api/group-forward-rules', async (c) => {
  try {
    const accountId = c.req.query('accountId') || undefined;
    const rules = await getGroupForwardRules(c.env.DB, accountId);
    return c.json({ success: true, data: rules.map(serializeRule) });
  } catch (err) {
    console.error('GET /api/group-forward-rules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

groupForwarding.post('/api/group-forward-rules', async (c) => {
  try {
    const body = await c.req.json<{
      lineAccountId?: string | null;
      name?: string;
      sourceGroupId?: string;
      targetGroupId?: string;
      approverUserId?: string;
    }>();

    if (!body.name || !body.sourceGroupId || !body.targetGroupId || !body.approverUserId) {
      return c.json({
        success: false,
        error: 'name, sourceGroupId, targetGroupId, approverUserId are required',
      }, 400);
    }

    const rule = await createGroupForwardRule(c.env.DB, {
      lineAccountId: body.lineAccountId ?? null,
      name: body.name,
      sourceGroupId: body.sourceGroupId,
      targetGroupId: body.targetGroupId,
      approverUserId: body.approverUserId,
    });

    return c.json({ success: true, data: serializeRule(rule) }, 201);
  } catch (err) {
    console.error('POST /api/group-forward-rules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

groupForwarding.put('/api/group-forward-rules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      lineAccountId?: string | null;
      name?: string;
      sourceGroupId?: string;
      targetGroupId?: string;
      approverUserId?: string;
      isActive?: boolean;
    }>();

    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      return c.json({ success: false, error: 'isActive must be a boolean' }, 400);
    }

    const updates: Parameters<typeof updateGroupForwardRule>[2] = {};
    if ('lineAccountId' in body) updates.lineAccountId = body.lineAccountId ?? null;
    if (body.name !== undefined) updates.name = body.name;
    if (body.sourceGroupId !== undefined) updates.sourceGroupId = body.sourceGroupId;
    if (body.targetGroupId !== undefined) updates.targetGroupId = body.targetGroupId;
    if (body.approverUserId !== undefined) updates.approverUserId = body.approverUserId;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await updateGroupForwardRule(c.env.DB, id, updates);

    if (!updated) {
      return c.json({ success: false, error: 'Rule not found' }, 404);
    }

    return c.json({ success: true, data: serializeRule(updated) });
  } catch (err) {
    console.error('PUT /api/group-forward-rules/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

groupForwarding.delete('/api/group-forward-rules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getGroupForwardRuleById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Rule not found' }, 404);
    }
    await deleteGroupForwardRule(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/group-forward-rules/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

groupForwarding.get('/api/group-forward-requests', async (c) => {
  try {
    const rawStatus = c.req.query('status');
    const allowedStatuses = new Set<GroupForwardRequestStatus>(['pending', 'approved', 'rejected', 'expired', 'failed']);
    const status = allowedStatuses.has(rawStatus as GroupForwardRequestStatus)
      ? rawStatus as GroupForwardRequestStatus
      : undefined;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const accountId = c.req.query('accountId') || undefined;
    const requests = await listGroupForwardRequests(c.env.DB, {
      status,
      lineAccountId: accountId,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return c.json({ success: true, data: requests.map(serializeRequest) });
  } catch (err) {
    console.error('GET /api/group-forward-requests error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { groupForwarding };
