package handlers

import (
	"github.com/kubestellar/console/pkg/api/middleware"

	"strings"

	"github.com/gofiber/fiber/v2"
)

func (h *StellarHandler) ListNotifications(c *fiber.Ctx) error {
	userID, err := middleware.RequireUserID(c)
	if err != nil {
		return err
	}
	_ = h.syncTimelineNotifications(c.UserContext(), userID)
	limit := middleware.ReadListLimitOrDefault(c)
	unreadOnly := strings.EqualFold(strings.TrimSpace(c.Query("unread")), "true")
	items, err := h.store.ListStellarNotifications(c.UserContext(), userID, limit, unreadOnly)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load notifications"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) MarkNotificationRead(c *fiber.Ctx) error {
	userID, err := middleware.RequireUserID(c)
	if err != nil {
		return err
	}
	notificationID := strings.TrimSpace(c.Params("id"))
	if notificationID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.MarkStellarNotificationRead(c.UserContext(), userID, notificationID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to mark notification read"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
