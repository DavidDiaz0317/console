package store

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

func TestFeatureRequestCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-feature", "featureuser")

	t.Run("Create and GetFeatureRequest round-trip", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "New Feature",
			Description: "Please add this",
			RequestType: models.RequestTypeFeature,
			TargetRepo:  models.TargetRepoConsole,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))
		require.NotEqual(t, uuid.Nil, req.ID)

		got, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "New Feature", got.Title)
		require.Equal(t, models.RequestStatusOpen, got.Status)
	})

	t.Run("GetFeatureRequestByIssueNumber returns correct request", func(t *testing.T) {
		issueNum := 123
		req := &models.FeatureRequest{
			UserID:            user.ID,
			Title:             "Issue Feature",
			Description:       "From issue",
			RequestType:       models.RequestTypeFeature,
			GitHubIssueNumber: &issueNum,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		got, err := s.GetFeatureRequestByIssueNumber(ctx, issueNum)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "Issue Feature", got.Title)
	})

	t.Run("GetFeatureRequestsByIssueNumbers batches lookups", func(t *testing.T) {
		issueNumOne := 234
		issueNumTwo := 345
		reqOne := &models.FeatureRequest{
			UserID:            user.ID,
			Title:             "First batched issue",
			Description:       "Batch one",
			RequestType:       models.RequestTypeFeature,
			GitHubIssueNumber: &issueNumOne,
		}
		reqTwo := &models.FeatureRequest{
			UserID:            user.ID,
			Title:             "Second batched issue",
			Description:       "Batch two",
			RequestType:       models.RequestTypeFeature,
			GitHubIssueNumber: &issueNumTwo,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, reqOne))
		require.NoError(t, s.CreateFeatureRequest(ctx, reqTwo))

		got, err := s.GetFeatureRequestsByIssueNumbers(ctx, []int{issueNumTwo, 999, issueNumOne})
		require.NoError(t, err)
		require.Len(t, got, 2)

		titlesByIssue := make(map[int]string, len(got))
		for _, request := range got {
			require.NotNil(t, request)
			require.NotNil(t, request.GitHubIssueNumber)
			titlesByIssue[*request.GitHubIssueNumber] = request.Title
		}
		require.Equal(t, reqOne.Title, titlesByIssue[issueNumOne])
		require.Equal(t, reqTwo.Title, titlesByIssue[issueNumTwo])

		empty, err := s.GetFeatureRequestsByIssueNumbers(ctx, nil)
		require.NoError(t, err)
		require.Empty(t, empty)
	})

	t.Run("GetUserFeatureRequests returns page of requests", func(t *testing.T) {
		for i := 0; i < 3; i++ {
			require.NoError(t, s.CreateFeatureRequest(ctx, &models.FeatureRequest{
				UserID:      user.ID,
				Title:       "Req",
				Description: "Desc",
				RequestType: models.RequestTypeFeature,
			}))
		}

		requests, err := s.GetUserFeatureRequests(ctx, user.ID, 0, 0)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(requests), 3)
	})

	t.Run("UpdateFeatureRequest modifies fields", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "To Update",
			Description: "Old",
			RequestType: models.RequestTypeFeature,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		req.Title = "Updated Title"
		req.Status = models.RequestStatusTriageAccepted
		require.NoError(t, s.UpdateFeatureRequest(ctx, req))

		got, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.Equal(t, "Updated Title", got.Title)
		require.Equal(t, models.RequestStatusTriageAccepted, got.Status)
		require.NotNil(t, got.UpdatedAt)
	})

	t.Run("UpdateFeatureRequestStatus changes status only", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "Status Update",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		require.NoError(t, s.UpdateFeatureRequestStatus(ctx, req.ID, models.RequestStatusClosed))

		got, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.Equal(t, models.RequestStatusClosed, got.Status)
	})
}

func TestPRFeedbackCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-feedback", "feedbackuser")
	req := &models.FeatureRequest{
		UserID:      user.ID,
		Title:       "Feedback Req",
		Description: "Desc",
		RequestType: models.RequestTypeFeature,
	}
	require.NoError(t, s.CreateFeatureRequest(ctx, req))

	t.Run("Create and GetPRFeedback round-trip", func(t *testing.T) {
		feedback := &models.PRFeedback{
			FeatureRequestID: req.ID,
			UserID:           user.ID,
			FeedbackType:     models.FeedbackTypePositive,
			Comment:          "Great work",
		}
		require.NoError(t, s.CreatePRFeedback(ctx, feedback))

		feedbacks, err := s.GetPRFeedback(ctx, req.ID)
		require.NoError(t, err)
		require.Len(t, feedbacks, 1)
		require.Equal(t, "Great work", feedbacks[0].Comment)
	})
}

func TestNotificationCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-notif", "notifuser")

	t.Run("Create and GetUserNotifications round-trip", func(t *testing.T) {
		notif := &models.Notification{
			UserID:           user.ID,
			NotificationType: models.NotificationTypeFixReady,
			Title:            "New Update",
			Message:          "Something happened",
		}
		require.NoError(t, s.CreateNotification(ctx, notif))

		notifs, err := s.GetUserNotifications(ctx, user.ID, 10)
		require.NoError(t, err)
		require.Len(t, notifs, 1)
		require.Equal(t, "New Update", notifs[0].Title)
	})

	t.Run("MarkNotificationReadByUser marks as read", func(t *testing.T) {
		user2 := createTestUser(t, s, "gh-notif-2", "notifuser2")
		notif := &models.Notification{
			UserID:           user2.ID,
			NotificationType: models.NotificationTypeFixReady,
			Title:            "Read Me",
			Message:          "Msg",
		}
		require.NoError(t, s.CreateNotification(ctx, notif))

		require.NoError(t, s.MarkNotificationReadByUser(ctx, notif.ID, user2.ID))

		count, err := s.GetUnreadNotificationCount(ctx, user2.ID)
		require.NoError(t, err)
		require.Equal(t, 0, count)
	})
}
