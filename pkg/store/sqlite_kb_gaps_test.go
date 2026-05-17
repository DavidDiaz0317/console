package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestKBGapStore(t *testing.T) *SQLiteStore {
	t.Helper()
	s, err := NewSQLiteStore(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { s.Close() })
	return s
}

func TestRecordKBGap_Single(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	require.NoError(t, s.RecordKBGap(ctx, "fixes/cert-manager"))

	gaps, err := s.ListTopKBGaps(ctx, 10)
	require.NoError(t, err)
	require.Len(t, gaps, 1)
	assert.Equal(t, "fixes/cert-manager", gaps[0].Path)
	assert.Equal(t, 1, gaps[0].HitCount)
	assert.NotEmpty(t, gaps[0].LastSeen)
}

func TestListTopKBGaps_OrderByHitCount(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	// "fixes/istio" queried 3 times, "fixes/argocd" 1 time
	for i := 0; i < 3; i++ {
		require.NoError(t, s.RecordKBGap(ctx, "fixes/istio"))
	}
	require.NoError(t, s.RecordKBGap(ctx, "fixes/argocd"))

	gaps, err := s.ListTopKBGaps(ctx, 10)
	require.NoError(t, err)
	require.Len(t, gaps, 2)

	assert.Equal(t, "fixes/istio", gaps[0].Path)
	assert.Equal(t, 3, gaps[0].HitCount)
	assert.Equal(t, "fixes/argocd", gaps[1].Path)
	assert.Equal(t, 1, gaps[1].HitCount)
}

func TestListTopKBGaps_LimitRespected(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	paths := []string{"a", "b", "c", "d", "e"}
	for _, p := range paths {
		require.NoError(t, s.RecordKBGap(ctx, p))
	}

	gaps, err := s.ListTopKBGaps(ctx, 3)
	require.NoError(t, err)
	assert.Len(t, gaps, 3)
}

func TestListTopKBGaps_DefaultLimit(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	// Insert more than kbGapDefaultN paths
	for i := 0; i < kbGapDefaultN+5; i++ {
		require.NoError(t, s.RecordKBGap(ctx, string(rune('a'+i))))
	}

	// n=0 should use kbGapDefaultN
	gaps, err := s.ListTopKBGaps(ctx, 0)
	require.NoError(t, err)
	assert.Len(t, gaps, kbGapDefaultN)
}

func TestListTopKBGaps_Empty(t *testing.T) {
	s := newTestKBGapStore(t)
	gaps, err := s.ListTopKBGaps(context.Background(), 10)
	require.NoError(t, err)
	assert.Empty(t, gaps)
}

func TestSweepOldKBGaps(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	// Insert a fresh gap
	require.NoError(t, s.RecordKBGap(ctx, "fixes/new"))

	// Manually insert an ancient row
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO kb_query_gaps (path, queried_at) VALUES (?, datetime('now', '-100 days'))`,
		"fixes/ancient",
	)
	require.NoError(t, err)

	deleted, err := s.SweepOldKBGaps(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted, "only the ancient row should be swept")

	gaps, err := s.ListTopKBGaps(ctx, 10)
	require.NoError(t, err)
	require.Len(t, gaps, 1)
	assert.Equal(t, "fixes/new", gaps[0].Path)
}
