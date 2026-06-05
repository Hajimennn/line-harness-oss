-- Approval-gated LINE group forwarding (MVP)
-- Stores forwarding rules and request state only. No separate logs table.

CREATE TABLE IF NOT EXISTS group_forward_rules (
  id               TEXT PRIMARY KEY,
  line_account_id  TEXT REFERENCES line_accounts(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  source_group_id  TEXT NOT NULL,
  target_group_id  TEXT NOT NULL,
  approver_user_id TEXT NOT NULL,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_group_forward_rules_source_active
  ON group_forward_rules(source_group_id, is_active);

CREATE INDEX IF NOT EXISTS idx_group_forward_rules_account
  ON group_forward_rules(line_account_id);

CREATE TABLE IF NOT EXISTS group_forward_requests (
  id               TEXT PRIMARY KEY,
  approval_code    TEXT NOT NULL UNIQUE,
  rule_id          TEXT NOT NULL REFERENCES group_forward_rules(id) ON DELETE CASCADE,
  line_account_id  TEXT REFERENCES line_accounts(id) ON DELETE SET NULL,
  source_group_id  TEXT NOT NULL,
  target_group_id  TEXT NOT NULL,
  approver_user_id TEXT NOT NULL,
  source_user_id   TEXT,
  line_message_id  TEXT NOT NULL UNIQUE,
  message_text     TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'failed')) DEFAULT 'pending',
  expires_at       TEXT NOT NULL,
  approved_at      TEXT,
  rejected_at      TEXT,
  forwarded_at     TEXT,
  failure_reason   TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_group_forward_requests_status_expires
  ON group_forward_requests(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_group_forward_requests_approver_status
  ON group_forward_requests(approver_user_id, status);

CREATE INDEX IF NOT EXISTS idx_group_forward_requests_rule
  ON group_forward_requests(rule_id);
