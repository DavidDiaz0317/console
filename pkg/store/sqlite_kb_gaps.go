package store

import (
	"context"
	"time"
)

const (
	kbGapMaxTopN   = 100
	kbGapDefaultN  = 20
	// kbGapRetention is how long gap rows are kept before sweep.
	kbGapRetention = 90 * 24 * time.Hour
)

// RecordKBGap appends a row for a browse path that returned zero results.
func (s *SQLiteStore) RecordKBGap(ctx context.Context, path string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO kb_query_gaps (path, queried_at) VALUES (?, CURRENT_TIMESTAMP)`,
		path,
	)
	return err
}

// ListTopKBGaps returns the top n zero-result paths ordered by hit count desc.
// n is clamped to kbGapMaxTopN; 0 uses kbGapDefaultN.
func (s *SQLiteStore) ListTopKBGaps(ctx context.Context, n int) ([]KBQueryGap, error) {
	if n <= 0 {
		n = kbGapDefaultN
	}
	if n > kbGapMaxTopN {
		n = kbGapMaxTopN
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT path, COUNT(*) AS hit_count, MAX(queried_at) AS last_seen
		FROM   kb_query_gaps
		GROUP  BY path
		ORDER  BY hit_count DESC, last_seen DESC
		LIMIT  ?`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	gaps := make([]KBQueryGap, 0)
	for rows.Next() {
		var g KBQueryGap
		if err := rows.Scan(&g.Path, &g.HitCount, &g.LastSeen); err != nil {
			return nil, err
		}
		gaps = append(gaps, g)
	}
	return gaps, rows.Err()
}

// SweepOldKBGaps deletes gap rows older than kbGapRetention.
// Returns the number of rows deleted.
func (s *SQLiteStore) SweepOldKBGaps(ctx context.Context) (int64, error) {
	cutoff := time.Now().UTC().Add(-kbGapRetention).Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM kb_query_gaps WHERE queried_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
