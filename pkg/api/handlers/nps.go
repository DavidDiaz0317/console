package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// NPSHandler handles Net Promoter Score submissions
type NPSHandler struct {
	store store.Store
}

// NewNPSHandler creates a new NPS handler
func NewNPSHandler(s store.Store) *NPSHandler {
	return &NPSHandler{store: s}
}

// SubmitNPS records an NPS score from the current user
// POST /api/nps
func (h *NPSHandler) SubmitNPS(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var input models.SubmitNPSInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if input.Score < 0 || input.Score > 10 {
		return fiber.NewError(fiber.StatusBadRequest, "Score must be between 0 and 10")
	}

	response := &models.NPSResponse{
		UserID:  userID,
		Score:   input.Score,
		Reason:  input.Reason,
		Trigger: input.Trigger,
	}

	if err := h.store.CreateNPSResponse(response); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to save NPS response")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status": "ok",
		"id":     response.ID,
	})
}

// GetNPSStatus returns the latest NPS response for the current user so the
// frontend can enforce the cooldown without a separate localStorage entry.
// GET /api/nps/status
func (h *NPSHandler) GetNPSStatus(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	latest, err := h.store.GetLatestNPSResponse(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch NPS status")
	}

	if latest == nil {
		return c.JSON(fiber.Map{"submitted": false})
	}

	return c.JSON(fiber.Map{
		"submitted":  true,
		"last_score": latest.Score,
		"last_at":    latest.CreatedAt,
	})
}
