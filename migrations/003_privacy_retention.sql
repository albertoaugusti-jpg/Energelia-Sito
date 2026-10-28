-- Additive metadata only. No historical classification, update, or deletion.
CREATE TABLE IF NOT EXISTS privacy_retention (
    source VARCHAR(32) NOT NULL CHECK (source IN ('leads','consultations','digital_project_requests','crm_lead')),
    record_id INTEGER NOT NULL,
    classification VARCHAR(20) NOT NULL DEFAULT 'unclassified'
        CHECK (classification IN ('unclassified','prospect','customer')),
    last_interaction_at TIMESTAMP,
    legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
    hold_reason TEXT NOT NULL DEFAULT '',
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(120),
    PRIMARY KEY (source, record_id)
);
CREATE INDEX IF NOT EXISTS privacy_retention_due ON privacy_retention(classification, last_interaction_at);
