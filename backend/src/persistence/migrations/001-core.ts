export const coreSchema = `
CREATE TABLE teacher_accounts (
  account_id TEXT PRIMARY KEY NOT NULL CHECK(length(account_id)>0),
  display_email TEXT NOT NULL, display_name TEXT NOT NULL, created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE teacher_settings (
  account_id TEXT PRIMARY KEY REFERENCES teacher_accounts(account_id),
  settings_json TEXT NOT NULL CHECK(json_valid(settings_json)), updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE activities (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  owner_account_id TEXT NOT NULL REFERENCES teacher_accounts(account_id),
  phase TEXT NOT NULL CHECK(phase IN ('waiting','active','ended')),
  created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK(next_sequence>=1),
  group_count INTEGER NOT NULL CHECK(group_count>=1),
  spreadsheet_id TEXT NOT NULL, spreadsheet_title TEXT NOT NULL,
  source_sheet_id INTEGER NOT NULL CHECK(source_sheet_id>=0), source_sheet_title TEXT NOT NULL,
  source_snapshot_json TEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
  source_fingerprint TEXT NOT NULL, source_confirmed_at INTEGER NOT NULL,
  UNIQUE(id,owner_account_id)
) STRICT;
CREATE UNIQUE INDEX one_live_activity ON activities((1)) WHERE phase IN ('waiting','active');
CREATE INDEX owner_history ON activities(owner_account_id,created_at,id);
CREATE TRIGGER immutable_owner BEFORE UPDATE OF owner_account_id ON activities
WHEN NEW.owner_account_id<>OLD.owner_account_id
BEGIN SELECT RAISE(ABORT,'immutable owner'); END;
CREATE TABLE runtime_state (
  slot INTEGER PRIMARY KEY CHECK(slot=1), current_activity_id TEXT REFERENCES activities(id)
) STRICT;
INSERT INTO runtime_state VALUES(1,NULL);
CREATE TABLE questions (
  activity_id TEXT NOT NULL REFERENCES activities(id), question_id TEXT NOT NULL,
  display_number TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('single','group')),
  ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  PRIMARY KEY(activity_id,question_id), UNIQUE(activity_id,ordinal)
) STRICT;
CREATE TABLE question_items (
  activity_id TEXT NOT NULL, question_id TEXT NOT NULL, item_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal>=1), label TEXT NOT NULL, prompt TEXT NOT NULL CHECK(length(prompt)>0),
  sheet_id INTEGER NOT NULL CHECK(sheet_id>=0), row_index INTEGER NOT NULL CHECK(row_index>=0),
  column_index INTEGER NOT NULL CHECK(column_index>=0),
  baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json)), merge_json TEXT NOT NULL CHECK(json_valid(merge_json)),
  PRIMARY KEY(activity_id,question_id,item_id), UNIQUE(activity_id,sheet_id,row_index,column_index),
  UNIQUE(activity_id,question_id,ordinal),
  FOREIGN KEY(activity_id,question_id) REFERENCES questions(activity_id,question_id)
) STRICT;
CREATE TRIGGER original_sheet_only BEFORE INSERT ON question_items
WHEN NEW.sheet_id<>(SELECT source_sheet_id FROM activities WHERE id=NEW.activity_id)
BEGIN SELECT RAISE(ABORT,'original worksheet required'); END;
CREATE TABLE participants (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  browser_token_digest TEXT NOT NULL UNIQUE CHECK(length(browser_token_digest)=64), created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE activity_groups (
  activity_id TEXT NOT NULL REFERENCES activities(id), id TEXT NOT NULL CHECK(length(id)=36),
  ordinal INTEGER NOT NULL CHECK(ordinal>=1), participant_id TEXT REFERENCES participants(id),
  name TEXT, joined_at INTEGER,
  PRIMARY KEY(activity_id,id), UNIQUE(activity_id,ordinal), UNIQUE(activity_id,participant_id),
  CHECK((participant_id IS NULL AND name IS NULL AND joined_at IS NULL) OR
    (participant_id IS NOT NULL AND name IS NOT NULL AND length(trim(name)) BETWEEN 1 AND 40 AND joined_at IS NOT NULL))
) STRICT;
CREATE TRIGGER immutable_group BEFORE UPDATE ON activity_groups
WHEN OLD.participant_id IS NOT NULL AND (NEW.participant_id IS NOT OLD.participant_id OR
  NEW.name IS NOT OLD.name OR NEW.joined_at IS NOT OLD.joined_at)
BEGIN SELECT RAISE(ABORT,'immutable group'); END;
CREATE TABLE submissions (
  activity_id TEXT NOT NULL, id TEXT NOT NULL CHECK(length(id)=36), group_id TEXT NOT NULL,
  question_id TEXT NOT NULL, request_id TEXT NOT NULL CHECK(length(request_id)=36),
  received_at INTEGER NOT NULL, sequence INTEGER NOT NULL CHECK(sequence>=1),
  PRIMARY KEY(activity_id,id), UNIQUE(activity_id,group_id,question_id), UNIQUE(activity_id,sequence),
  UNIQUE(activity_id,id,question_id),
  FOREIGN KEY(activity_id,group_id) REFERENCES activity_groups(activity_id,id),
  FOREIGN KEY(activity_id,question_id) REFERENCES questions(activity_id,question_id)
) STRICT;
CREATE INDEX question_order ON submissions(activity_id,question_id,sequence);
CREATE TABLE submission_answers (
  activity_id TEXT NOT NULL, submission_id TEXT NOT NULL, question_id TEXT NOT NULL, item_id TEXT NOT NULL,
  answer TEXT NOT NULL CHECK(length(trim(answer)) BETWEEN 1 AND 2000),
  PRIMARY KEY(activity_id,submission_id,item_id),
  FOREIGN KEY(activity_id,submission_id,question_id) REFERENCES submissions(activity_id,id,question_id),
  FOREIGN KEY(activity_id,question_id,item_id) REFERENCES question_items(activity_id,question_id,item_id)
) STRICT;
CREATE TABLE results (
  activity_id TEXT NOT NULL, question_id TEXT NOT NULL, winner_submission_id TEXT,
  PRIMARY KEY(activity_id,question_id),
  FOREIGN KEY(activity_id,question_id) REFERENCES questions(activity_id,question_id),
  FOREIGN KEY(activity_id,winner_submission_id,question_id) REFERENCES submissions(activity_id,id,question_id)
) STRICT;
CREATE TRIGGER immutable_result BEFORE UPDATE ON results
BEGIN SELECT RAISE(ABORT,'immutable result'); END;
CREATE TABLE command_receipts (
  activity_id TEXT NOT NULL REFERENCES activities(id), actor_key TEXT NOT NULL, event TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK(length(request_id)=36), payload_fingerprint TEXT NOT NULL,
  outcome_json TEXT NOT NULL CHECK(json_valid(outcome_json)), created_at INTEGER NOT NULL,
  PRIMARY KEY(activity_id,actor_key,event,request_id)
) STRICT;
CREATE TABLE account_command_receipts (
  owner_account_id TEXT NOT NULL REFERENCES teacher_accounts(account_id), event TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK(length(request_id)=36), payload_fingerprint TEXT NOT NULL,
  outcome_json TEXT NOT NULL CHECK(json_valid(outcome_json)), created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_account_id,event,request_id)
) STRICT;
CREATE TABLE writeback_jobs (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36), activity_id TEXT NOT NULL UNIQUE,
  owner_account_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('writing','pending','verified','conflict','failed')),
  reason_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(id,activity_id),
  FOREIGN KEY(activity_id,owner_account_id) REFERENCES activities(id,owner_account_id)
) STRICT;
CREATE INDEX queued_jobs ON writeback_jobs(status,updated_at);
CREATE TRIGGER ended_job_only BEFORE INSERT ON writeback_jobs
WHEN (SELECT phase FROM activities WHERE id=NEW.activity_id)<>'ended'
BEGIN SELECT RAISE(ABORT,'ended activity required'); END;
CREATE TABLE writeback_question_states (
  job_id TEXT NOT NULL, activity_id TEXT NOT NULL, question_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('writing','pending','verified','conflict','failed')),
  expected_answers_json TEXT NOT NULL CHECK(json_valid(expected_answers_json)),
  target_snapshot_json TEXT NOT NULL CHECK(json_valid(target_snapshot_json)), safe_error_code TEXT,
  retry_cycle INTEGER NOT NULL DEFAULT 0 CHECK(retry_cycle>=0),
  write_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(write_attempt_count BETWEEN 0 AND 3),
  verification_failure_count INTEGER NOT NULL DEFAULT 0 CHECK(verification_failure_count BETWEEN 0 AND 4),
  next_attempt_at INTEGER, updated_at INTEGER NOT NULL,
  PRIMARY KEY(job_id,question_id),
  FOREIGN KEY(job_id,activity_id) REFERENCES writeback_jobs(id,activity_id),
  FOREIGN KEY(activity_id,question_id) REFERENCES questions(activity_id,question_id)
) STRICT;
CREATE TABLE writeback_attempts (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36), job_id TEXT NOT NULL, question_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal>=1), retry_cycle INTEGER NOT NULL CHECK(retry_cycle>=0),
  kind TEXT NOT NULL CHECK(kind IN ('precheck','write','verify')),
  started_at INTEGER NOT NULL, finished_at INTEGER, outcome TEXT NOT NULL, safe_error_code TEXT,
  UNIQUE(job_id,question_id,ordinal),
  FOREIGN KEY(job_id,question_id) REFERENCES writeback_question_states(job_id,question_id)
) STRICT;
`;
