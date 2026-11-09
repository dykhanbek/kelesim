-- KYB, export control, import checklist
-- Sanctioned persons and PEPs are imported next to organisations; kind tells them apart.
ALTER TABLE sanctions_entities ADD COLUMN kind TEXT NOT NULL DEFAULT 'org';  -- org | person
-- Owners / beneficiary / director of a saved counterparty (JSON array of RelatedParty)
ALTER TABLE counterparties ADD COLUMN related_json TEXT;
-- Import checklist items ticked off by the user: {"<item id>": "done" | "na"}
ALTER TABLE deals ADD COLUMN checklist_json TEXT;
