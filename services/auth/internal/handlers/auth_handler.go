package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"emergency-dispatch/services/auth/internal/middleware"
	"emergency-dispatch/services/auth/internal/models"
	"emergency-dispatch/services/auth/internal/repository"
)

type AuthHandler struct {
	repo      *repository.UserRepository
	jwtSecret string
}

func NewAuthHandler(repo *repository.UserRepository, jwtSecret string) *AuthHandler {
	return &AuthHandler{repo: repo, jwtSecret: jwtSecret}
}

// --- Request/Response types ---

type RegisterRequest struct {
	Name      string `json:"name" binding:"required"`
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	Role      string `json:"role" binding:"required"`
	StationID string `json:"station_id,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

// --- Handlers ---

// Register creates a new user account
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !models.IsValidRole(req.Role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role. Valid roles: system_admin, hospital_admin, police_admin, fire_admin, ambulance_driver"})
		return
	}

	// Enforce that driver roles must be associated with a station
	if strings.Contains(req.Role, "driver") && req.StationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "station_id is required for driver roles"})
		return
	}

	// Check if email already exists
	if existing, _ := h.repo.FindByEmail(req.Email); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := &models.User{
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         req.Role,
	}

	if req.StationID != "" {
		sid, err := uuid.Parse(req.StationID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station_id format"})
			return
		}
		user.StationID = &sid
	}

	if err := h.repo.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "User registered successfully",
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

// Login authenticates a user and returns JWT tokens
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.repo.FindByEmail(req.Email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	tokens, err := h.generateTokens(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	c.JSON(http.StatusOK, tokens)
}

// RefreshToken exchanges a refresh token for a new token pair
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Find the refresh token in DB
	storedToken, err := h.repo.FindRefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	// Check if expired
	if time.Now().After(storedToken.ExpiresAt) {
		h.repo.DeleteRefreshToken(req.RefreshToken)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token expired"})
		return
	}

	// Get user
	user, err := h.repo.FindByID(storedToken.UserID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	// Delete old refresh token
	h.repo.DeleteRefreshToken(req.RefreshToken)

	// Generate new tokens
	tokens, err := h.generateTokens(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	c.JSON(http.StatusOK, tokens)
}

// Profile returns the current user's profile
func (h *AuthHandler) Profile(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.repo.FindByID(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// ListUsers returns all users (admin only)
func (h *AuthHandler) ListUsers(c *gin.Context) {
	users, err := h.repo.FindAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}
	c.JSON(http.StatusOK, users)
}

type UpdateUserRequest struct {
	Name      *string `json:"name"`
	Role      *string `json:"role"`
	StationID *string `json:"station_id"`
}

type UpdateProfileRequest struct {
	Name     *string `json:"name"`
	Password *string `json:"password"`
}

// UpdateProfile updates the authenticated user's non-critical fields.
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.repo.FindByID(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		user.Name = trimmed
	}

	if req.Password != nil {
		if len(*req.Password) < 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
			return
		}
		hash, hashErr := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}
		user.PasswordHash = string(hash)
	}

	if err := h.repo.Update(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// UpdateUser updates an existing user's metadata (admin only)
func (h *AuthHandler) UpdateUser(c *gin.Context) {
	idStr := c.Param("id")
	uid, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.repo.FindByID(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		user.Name = *req.Name
	}
	// Determine resulting role after update
	resultingRole := user.Role
	if req.Role != nil {
		if !models.IsValidRole(*req.Role) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role"})
			return
		}
		resultingRole = *req.Role
	}

	// If role becomes a driver role, ensure a station will be set
	if strings.Contains(resultingRole, "driver") {
		// If station_id is being provided explicitly
		if req.StationID != nil {
			if *req.StationID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "station_id is required for driver roles"})
				return
			}
			// will parse below
		} else {
			// no station provided in update payload — ensure an existing station exists
			if user.StationID == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "station_id is required for driver roles"})
				return
			}
		}
	}

	if req.Role != nil {
		user.Role = *req.Role
	}

	if req.StationID != nil {
		if *req.StationID == "" {
			// Disallow clearing station if resulting role requires one
			if strings.Contains(resultingRole, "driver") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "station_id is required for driver roles"})
				return
			}
			user.StationID = nil
		} else {
			sid, err := uuid.Parse(*req.StationID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station_id format"})
				return
			}
			user.StationID = &sid
		}
	}

	if err := h.repo.Update(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// DeleteUser removes a user account (admin only)
func (h *AuthHandler) DeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	uid, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Delete refresh tokens first
	if err := h.repo.DeleteUserRefreshTokens(uid); err != nil {
		// log but continue
	}

	if err := h.repo.DeleteByID(uid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.Status(http.StatusNoContent)
}

// --- Token generation ---

func (h *AuthHandler) generateTokens(user *models.User) (*TokenResponse, error) {
	// Access token - 15 minutes
	accessExp := time.Now().Add(15 * time.Minute)
	stationID := ""
	if user.StationID != nil {
		stationID = user.StationID.String()
	}

	accessClaims := &middleware.Claims{
		UserID:    user.ID.String(),
		Email:     user.Email,
		Role:      user.Role,
		StationID: stationID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(accessExp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessStr, err := accessToken.SignedString([]byte(h.jwtSecret))
	if err != nil {
		return nil, err
	}

	// Refresh token - random string, stored in DB, 7 days
	refreshBytes := make([]byte, 32)
	if _, err := rand.Read(refreshBytes); err != nil {
		return nil, err
	}
	refreshStr := hex.EncodeToString(refreshBytes)

	refreshToken := &models.RefreshToken{
		UserID:    user.ID,
		Token:     refreshStr,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}

	if err := h.repo.CreateRefreshToken(refreshToken); err != nil {
		return nil, err
	}

	return &TokenResponse{
		AccessToken:  accessStr,
		RefreshToken: refreshStr,
		ExpiresIn:    int64(15 * 60), // 15 minutes in seconds
	}, nil
}
