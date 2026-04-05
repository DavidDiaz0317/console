package handlers

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
)

// NotificationHandler handles alert notification API endpoints
type NotificationHandler struct {
	store   store.Store
	service *notifications.Service
}

// NewNotificationHandler creates a new notification handler
func NewNotificationHandler(store store.Store, service *notifications.Service) *NotificationHandler {
	return &NotificationHandler{
		store:   store,
		service: service,
	}
}

// TestNotificationRequest represents a test notification request
type TestNotificationRequest struct {
	Type   string                 `json:"type"`
	Config map[string]interface{} `json:"config"`
}

// SendAlertNotificationRequest represents a request to send an alert notification
type SendAlertNotificationRequest struct {
	Alert    notifications.Alert                 `json:"alert"`
	Channels []notifications.NotificationChannel `json:"channels"`
}

// TestNotification tests a notification channel configuration
// POST /api/notifications/test
func (h *NotificationHandler) TestNotification(c *fiber.Ctx) error {
	var req TestNotificationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Notification type is required",
		})
	}

	err := h.service.TestNotifier(req.Type, req.Config)
	if err != nil {
		slog.Error("[Notifications] test failed", "error", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Notification test failed",
			"message": "notification test failed",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Test notification sent successfully",
	})
}

// SendAlertNotification sends an alert notification to configured channels
// POST /api/notifications/send
func (h *NotificationHandler) SendAlertNotification(c *fiber.Ctx) error {
	var req SendAlertNotificationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Send alert to specified channels
	err := h.service.SendAlertToChannels(req.Alert, req.Channels)
	if err != nil {
		slog.Error("[Notifications] failed to send alert", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to send notification",
			"message": "failed to send notification",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Alert notification sent successfully",
	})
}

// BatchSendAlertNotificationRequest represents a batched alert notification request
type BatchSendAlertNotificationRequest struct {
	Notifications []SendAlertNotificationRequest `json:"notifications"`
}

// SendBatchAlertNotifications sends multiple alert notifications in a single request,
// reducing HTTP round-trips when many alerts fire in the same evaluation cycle.
// POST /api/notifications/send-batch
func (h *NotificationHandler) SendBatchAlertNotifications(c *fiber.Ctx) error {
	var req BatchSendAlertNotificationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if len(req.Notifications) == 0 {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "No notifications to send",
		})
	}

	var errs []string
	for _, item := range req.Notifications {
		if err := h.service.SendAlertToChannels(item.Alert, item.Channels); err != nil {
			slog.Error("[Notifications] batch item failed", "error", err)
			errs = append(errs, err.Error())
		}
	}

	if len(errs) > 0 {
		return c.JSON(fiber.Map{
			"success": false,
			"errors":  errs,
			"message": "One or more notifications failed to send",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Batch alert notifications sent successfully",
	})
}

// GetNotificationConfig gets the notification configuration for a user
// GET /api/notifications/config
func (h *NotificationHandler) GetNotificationConfig(c *fiber.Ctx) error {
	// Get user from context (set by auth middleware)
	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	// Return empty config - actual config is stored client-side
	// This endpoint exists for future server-side config storage
	return c.JSON(notifications.NotificationConfig{})
}

// SaveNotificationConfig saves the notification configuration for a user
// POST /api/notifications/config
func (h *NotificationHandler) SaveNotificationConfig(c *fiber.Ctx) error {
	// Get user from context (set by auth middleware)
	userID := c.Locals("userID")
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	var config notifications.NotificationConfig
	if err := c.BodyParser(&config); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Config validation only - actual storage is client-side
	// This endpoint exists for future server-side config storage
	return c.JSON(fiber.Map{
		"success": true,
		"message": "Notification configuration validated successfully",
	})
}
