package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

const (
	onboardingResponseBatchColumnCount = 5
	cardBatchColumnCount               = 6
)

type sqlExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type sqliteTransactionStore struct {
	tx *sql.Tx
}

func (s *SQLiteStore) WithTransaction(ctx context.Context, fn func(TransactionStore) error) error {
	if ctx == nil {
		ctx = context.Background()
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	if callbackErr := fn(&sqliteTransactionStore{tx: tx}); callbackErr != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return fmt.Errorf("rollback transaction: %w (original error: %v)", rollbackErr, callbackErr)
		}
		return callbackErr
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func (s *SQLiteStore) SaveOnboardingResponses(ctx context.Context, responses []models.OnboardingResponse) error {
	return saveOnboardingResponses(ctx, s.db, responses)
}

func (t *sqliteTransactionStore) SaveOnboardingResponses(ctx context.Context, responses []models.OnboardingResponse) error {
	return saveOnboardingResponses(ctx, t.tx, responses)
}

func saveOnboardingResponses(ctx context.Context, execer sqlExecContext, responses []models.OnboardingResponse) error {
	if len(responses) == 0 {
		return nil
	}

	now := time.Now()
	placeholders := make([]string, 0, len(responses))
	args := make([]any, 0, len(responses)*onboardingResponseBatchColumnCount)
	for i := range responses {
		if responses[i].ID == uuid.Nil {
			responses[i].ID = uuid.New()
		}
		responses[i].CreatedAt = now
		placeholders = append(placeholders, "(?, ?, ?, ?, ?)")
		args = append(args,
			responses[i].ID.String(),
			responses[i].UserID.String(),
			responses[i].QuestionKey,
			responses[i].Answer,
			responses[i].CreatedAt,
		)
	}

	query := `INSERT INTO onboarding_responses (id, user_id, question_key, answer, created_at) VALUES ` + strings.Join(placeholders, ", ") +
		` ON CONFLICT(user_id, question_key) DO UPDATE SET
		   answer = excluded.answer,
		   created_at = excluded.created_at`
	_, err := execer.ExecContext(ctx, query, args...)
	return err
}

func (t *sqliteTransactionStore) CreateDashboard(ctx context.Context, dashboard *models.Dashboard) error {
	return insertDashboard(ctx, t.tx, dashboard)
}

func insertDashboard(ctx context.Context, execer sqlExecContext, dashboard *models.Dashboard) error {
	if dashboard.ID == uuid.Nil {
		dashboard.ID = uuid.New()
	}
	dashboard.CreatedAt = time.Now()

	var layoutStr *string
	if dashboard.Layout != nil {
		str := string(dashboard.Layout)
		layoutStr = &str
	}

	_, err := execer.ExecContext(ctx, `INSERT INTO dashboards (id, user_id, name, layout, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		dashboard.ID.String(), dashboard.UserID.String(), dashboard.Name, layoutStr, boolToInt(dashboard.IsDefault), dashboard.CreatedAt)
	return err
}

func (s *SQLiteStore) CreateCards(ctx context.Context, cards []models.Card) error {
	return insertCards(ctx, s.db, cards)
}

func (t *sqliteTransactionStore) CreateCards(ctx context.Context, cards []models.Card) error {
	return insertCards(ctx, t.tx, cards)
}

func insertCards(ctx context.Context, execer sqlExecContext, cards []models.Card) error {
	if len(cards) == 0 {
		return nil
	}

	now := time.Now()
	placeholders := make([]string, 0, len(cards))
	args := make([]any, 0, len(cards)*cardBatchColumnCount)
	for i := range cards {
		if cards[i].ID == uuid.Nil {
			cards[i].ID = uuid.New()
		}
		cards[i].CreatedAt = now

		positionJSON, err := json.Marshal(cards[i].Position)
		if err != nil {
			return fmt.Errorf("failed to marshal card position: %w", err)
		}

		var configStr *string
		if cards[i].Config != nil {
			str := string(cards[i].Config)
			configStr = &str
		}

		placeholders = append(placeholders, "(?, ?, ?, ?, ?, ?)")
		args = append(args,
			cards[i].ID.String(),
			cards[i].DashboardID.String(),
			string(cards[i].CardType),
			configStr,
			string(positionJSON),
			cards[i].CreatedAt,
		)
	}

	query := `INSERT INTO cards (id, dashboard_id, card_type, config, position, created_at) VALUES ` + strings.Join(placeholders, ", ")
	_, err := execer.ExecContext(ctx, query, args...)
	return err
}

func (t *sqliteTransactionStore) SetUserOnboarded(ctx context.Context, userID uuid.UUID) error {
	return updateUserOnboarded(ctx, t.tx, userID)
}

func updateUserOnboarded(ctx context.Context, execer sqlExecContext, userID uuid.UUID) error {
	_, err := execer.ExecContext(ctx, `UPDATE users SET onboarded = 1 WHERE id = ?`, userID.String())
	return err
}
