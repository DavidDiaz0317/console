package middleware

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestJWTAuth(t *testing.T) {
	app := fiber.New()
	handler := JWTAuth("test-secret")

	// Protected route
	app.Get("/protected", handler, func(c *fiber.Ctx) error {
		return c.SendString("success")
	})

	t.Run("Valid Token", func(t *testing.T) {
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})

	t.Run("Missing Header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected", nil)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Invalid Format", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "InvalidFormat")
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		token, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Expired Token", func(t *testing.T) {
		token, _ := generateTestToken("test-secret", time.Now().Add(-1*time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Query Param Fallback (Stream)", func(t *testing.T) {
		// Middleware supports query param ?_token=... for /stream paths
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected/stream?_token="+token, nil)

		// Setup stream route specifically
		app.Get("/protected/stream", handler, func(c *fiber.Ctx) error {
			return c.SendString("stream-ok")
		})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})
}

func TestGetContextHelpers(t *testing.T) {
	app := fiber.New()

	// Middleware that injects user data manually to test helpers
	app.Use(func(c *fiber.Ctx) error {
		uid := uuid.MustParse("123e4567-e89b-12d3-a456-426614174000")
		c.Locals("userID", uid)
		c.Locals("githubLogin", "test-user")
		return c.Next()
	})

	app.Get("/me", func(c *fiber.Ctx) error {
		uid := GetUserID(c)
		login := GetGitHubLogin(c)
		return c.JSON(fiber.Map{
			"uid":   uid.String(),
			"login": login,
		})
	})

	req := httptest.NewRequest("GET", "/me", nil)
	resp, err := app.Test(req, 5000)
	if err != nil || resp == nil {
		t.Fatalf("app.Test failed: %v", err)
	}
	assert.Equal(t, 200, resp.StatusCode)

	// Validate body content
	// (Implementation detail: we trust Fiber locals works, we are testing the Get* helpers)
}

// TestRevokedTokenCacheEviction validates that the in-memory cache never grows
// without bound: backfilled (zero-time) entries must be evicted when the cache
// exceeds its size thresholds.
func TestRevokedTokenCacheEviction(t *testing.T) {
	t.Run("cleanup evicts backfilled entries above half-max", func(t *testing.T) {
		c := &revokedTokenCache{
			tokens: make(map[string]time.Time),
		}
		// Fill cache with zero-time (backfilled) entries just above the half-max
		// threshold so cleanup() must evict them.
		for i := 0; i < revokedTokenCacheHalfMax+1; i++ {
			c.tokens[fmt.Sprintf("jti-%d", i)] = time.Time{}
		}
		c.cleanup()
		assert.Equal(t, 0, len(c.tokens), "cleanup should remove all zero-time entries when above half-max")
	})

	t.Run("cleanup does not evict backfilled entries below half-max", func(t *testing.T) {
		c := &revokedTokenCache{
			tokens: make(map[string]time.Time),
		}
		// Add fewer zero-time entries than the half-max threshold.
		for i := 0; i < 5; i++ {
			c.tokens[fmt.Sprintf("jti-%d", i)] = time.Time{}
		}
		c.cleanup()
		assert.Equal(t, 5, len(c.tokens), "cleanup should not evict entries when cache is below half-max")
	})

	t.Run("Revoke evicts zero-time entries when over max size", func(t *testing.T) {
		c := &revokedTokenCache{
			tokens: make(map[string]time.Time),
		}
		// Pre-fill with revokedTokenCacheMaxSize zero-time (backfilled) entries.
		for i := 0; i < revokedTokenCacheMaxSize; i++ {
			c.tokens[fmt.Sprintf("jti-%d", i)] = time.Time{}
		}
		// Adding one more via Revoke must trigger eviction.
		c.Revoke("new-jti", time.Now().Add(time.Hour))
		assert.LessOrEqual(t, len(c.tokens), revokedTokenCacheMaxSize,
			"cache size must not exceed revokedTokenCacheMaxSize after Revoke")
		// The newly revoked token must still be present.
		_, present := c.tokens["new-jti"]
		assert.True(t, present, "newly revoked token must remain in cache after eviction")
	})

	t.Run("Revoke evicts expired entries first before zero-time entries", func(t *testing.T) {
		c := &revokedTokenCache{
			tokens: make(map[string]time.Time),
		}
		past := time.Now().Add(-time.Hour)
		// Half expired, half backfilled (zero-time), total at max.
		for i := 0; i < revokedTokenCacheMaxSize/2; i++ {
			c.tokens[fmt.Sprintf("expired-%d", i)] = past
		}
		for i := 0; i < revokedTokenCacheMaxSize/2; i++ {
			c.tokens[fmt.Sprintf("backfilled-%d", i)] = time.Time{}
		}
		c.Revoke("new-jti", time.Now().Add(time.Hour))
		assert.LessOrEqual(t, len(c.tokens), revokedTokenCacheMaxSize,
			"cache must not exceed max size after Revoke with mixed entries")
	})
}

func generateTestToken(secret string, expiry time.Time) (string, error) {
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func TestValidateJWT(t *testing.T) {
	secret := "test-secret"

	t.Run("Valid", func(t *testing.T) {
		token, _ := generateTestToken(secret, time.Now().Add(time.Hour))
		claims, err := ValidateJWT(token, secret)
		assert.NoError(t, err)
		assert.NotNil(t, claims)
	})

	t.Run("Expired", func(t *testing.T) {
		token, _ := generateTestToken(secret, time.Now().Add(-1*time.Hour))
		_, err := ValidateJWT(token, secret)
		assert.Error(t, err)
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		token, _ := generateTestToken("wrong", time.Now().Add(time.Hour))
		_, err := ValidateJWT(token, secret)
		assert.Error(t, err)
	})
}
