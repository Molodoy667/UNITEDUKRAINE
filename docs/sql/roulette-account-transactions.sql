-- Operator migration: take a current backup and schedule a short game-server maintenance window.
-- Only the storage engine changes. No account columns or balances are changed by this statement.
-- The operator approved this conversion; migration 005 also performs it automatically when needed.
ALTER TABLE accounts_1101 ENGINE=InnoDB;
