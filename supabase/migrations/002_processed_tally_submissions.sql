-- Deduplicate Tally webhooks: one submission_id = process once.
CREATE TABLE IF NOT EXISTS processed_tally_submissions (
  submission_id text PRIMARY KEY
);
