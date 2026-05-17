package middleware

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	defaultListLimit = 50
	maxListLimit     = 200
)

func resolveStellarUserID(c *fiber.Ctx) string {
	if id := GetUserID(c); id != uuid.Nil {
		return id.String()
	}
	if login := GetGitHubLogin(c); login != "" {
		return login
	}
	return ""
}

// RequireUserID returns the resolved Stellar user ID or a 401 error.
func RequireUserID(c *fiber.Ctx) (string, error) {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "not authenticated")
	}
	return userID, nil
}

// RequireEditorOrAdmin verifies the current request's user has at least the editor role.
func RequireEditorOrAdmin(c *fiber.Ctx, s store.Store) error {
	if s == nil {
		return nil
	}
	userID := GetUserID(c)
	user, err := s.GetUser(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify user role")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusForbidden, "User not found")
	}
	if user.Role != models.UserRoleAdmin && user.Role != models.UserRoleEditor {
		return fiber.NewError(fiber.StatusForbidden, "Editor or admin role required")
	}
	return nil
}

// ReadListLimitOrDefault reads the limit query param with Stellar defaults applied.
func ReadListLimitOrDefault(c *fiber.Ctx) int {
	limit := defaultListLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}
	return limit
}
