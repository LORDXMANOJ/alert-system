/**
 * Versioned schema migrations. Each entry is applied once, in order, inside a transaction,
 * and recorded in `schema_migrations`. Never edit a migration that has shipped; add a new one.
 */
export type Migration = { version: number; name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "core schema",
    sql: `
CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  region_id TEXT NOT NULL REFERENCES regions(id),
  city TEXT NOT NULL,
  is_new BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  designation TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','institution','regional','bureau','evc','reviewer','authority','auditor')),
  region_id TEXT REFERENCES regions(id),
  institution_id TEXT REFERENCES institutions(id),
  CHECK (role <> 'institution' OR institution_id IS NOT NULL),
  CHECK (role <> 'regional' OR region_id IS NOT NULL)
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  data BYTEA NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE workflow_stages (
  id SERIAL PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  target_days INTEGER NOT NULL CHECK (target_days > 0),
  is_evc BOOLEAN NOT NULL DEFAULT FALSE,
  is_committee BOOLEAN NOT NULL DEFAULT FALSE,
  is_decision BOOLEAN NOT NULL DEFAULT FALSE,
  checklist TEXT NOT NULL DEFAULT '[]',
  UNIQUE (template_id, position)
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  region_id TEXT NOT NULL REFERENCES regions(id),
  template_id TEXT NOT NULL REFERENCES workflow_templates(id),
  category TEXT NOT NULL,
  stage_position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress','clarification','decided')),
  priority TEXT NOT NULL CHECK (priority IN ('normal','high')),
  submitted_at TIMESTAMPTZ NOT NULL,
  stage_entered_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  last_action_at TIMESTAMPTZ NOT NULL,
  decision TEXT CHECK (decision IN ('approved','deferred','rejected')),
  decision_reason TEXT,
  clarification_reason TEXT,
  assignee_id TEXT REFERENCES users(id)
);
CREATE INDEX applications_status_stage_idx ON applications (status, stage_position);
CREATE INDEX applications_institution_idx ON applications (institution_id);

CREATE TABLE application_events (
  id SERIAL PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  type TEXT NOT NULL,
  from_stage INTEGER,
  to_stage INTEGER,
  reason TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX application_events_app_idx ON application_events (application_id, created_at);

CREATE TABLE evc_records (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  status TEXT NOT NULL CHECK (status IN ('awaiting_scheduling','scheduling_in_progress','scheduled','completed','report_pending','follow_up_required','closed')),
  target_date TIMESTAMPTZ NOT NULL,
  scheduled_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  coordinator_id TEXT REFERENCES users(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE undertakings (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  application_id TEXT NOT NULL REFERENCES applications(id),
  condition TEXT NOT NULL,
  evidence_required TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','submitted','correction_requested','verified')),
  verified_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE undertaking_submissions (
  id SERIAL PRIMARY KEY,
  undertaking_id TEXT NOT NULL REFERENCES undertakings(id),
  version_no INTEGER NOT NULL,
  note TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id),
  submitted_by TEXT NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','correction_requested')),
  reviewer_id TEXT REFERENCES users(id),
  remarks TEXT,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (undertaking_id, version_no)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  application_id TEXT REFERENCES applications(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE document_versions (
  id SERIAL PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  version_no INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','returned')),
  reviewer_id TEXT REFERENCES users(id),
  remarks TEXT,
  reviewed_at TIMESTAMPTZ,
  replaces_version_id INTEGER REFERENCES document_versions(id),
  UNIQUE (document_id, version_no)
);

CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  record_type TEXT NOT NULL,
  description TEXT NOT NULL,
  thresholds_days TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  responsible_role TEXT NOT NULL,
  escalation_delay_days INTEGER NOT NULL CHECK (escalation_delay_days > 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES alert_rules(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_label TEXT NOT NULL,
  institution_id TEXT REFERENCES institutions(id),
  region_id TEXT REFERENCES regions(id),
  threshold_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  responsible_role TEXT NOT NULL,
  link TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  UNIQUE (rule_id, entity_type, entity_id, threshold_key)
);
CREATE INDEX alerts_status_idx ON alerts (status);

CREATE TABLE escalation_events (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER NOT NULL REFERENCES alerts(id),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  to_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (alert_id, level)
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical','success')),
  link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);
CREATE INDEX notifications_user_idx ON notifications (user_id, read_at);

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: updates and deletes are not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER application_events_append_only BEFORE UPDATE OR DELETE ON application_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
`,
  },
];
