# Beginner's Guide to the Emergency Dispatch System
## Line-by-Line Explanations with Real Code

---

## Part 1: AUTH SERVICE WALKTHROUGH (Line by Line)

### What is the Auth Service?
The **Auth Service** is like a **bouncer at a nightclub**. Before anyone (frontend or another service) can use the system, they need to:
1. Register (create an account)
2. Login (prove who they are)
3. Get a special pass (JWT token)
4. Show that pass to access protected features

The Auth Service runs on **port 8081** and manages all of this.

---

### 1. The Startup (`services/auth/cmd/main.go`)

```go
package main

import (
	"log"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	// ... more imports
)

func main() {
	// Step 1: Load environment variables from .env file
	godotenv.Load("../../.env")
```

**What's happening here?**
- `godotenv.Load()` reads the `.env` file (which contains secrets like database password, JWT secret, etc.)
- Think of `.env` as a **configuration safe** that stores sensitive information separately from code
- Sample `.env` values:
  ```
  DB_HOST=localhost
  DB_NAME_AUTH=auth_service
  JWT_SECRET=super-secret-key
  ```

```go
	// Step 2: Load the configuration
	cfg := config.Load()
```

**What's `config.Load()`?**
- Creates a `Config` struct with values from environment variables
- Example:
  ```go
  type Config struct {
      Port      string // "8081"
      DBHost    string // "localhost"
      DBPassword string // "password123"
      JWTSecret string // "super-secret-key"
  }
  ```

```go
	// Step 3: Connect to PostgreSQL database
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to auth_db")
```

**Breaking this down:**
- `cfg.DSN()` builds a **connection string**: `"postgres://user:password@localhost:5432/auth_service"`
- `gorm.Open()` connects to PostgreSQL using that string
- If connection fails, `err` is not nil, and the program crashes with an error message
- If successful, we now have a `db` object we can use for database operations

Think of it like: **"Here's my username and password to the database. Let me in!"**

```go
	// Step 4: Auto-migrate the database schema
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}
	log.Println("Database migrated")
```

**What does "migrate" mean?**
- It's like **running a setup script** on the database
- GORM looks at your Go models (`User`, `RefreshToken`) and creates database tables to match
- Example: Your `User` struct has fields like `Name`, `Email`, `PasswordHash`
- Migration creates a `users` table with columns: `id`, `name`, `email`, `password_hash`, etc.
- If table already exists, it does nothing (idempotent)

```go
	// Step 5: Seed demo data (if first time running)
	if err := seed.Run(db); err != nil {
		log.Fatalf("Failed to seed auth demo data: %v", err)
	}
```

**What's "seeding"?**
- Inserts initial demo data into the database
- Example: Creates demo users like admin@example.com for testing
- Prevents you from having an empty database on first run

```go
	// Step 6: Create the repository layer
	repo := repository.NewUserRepository(db)
	
	// Step 7: Create the handler layer
	handler := handlers.NewAuthHandler(repo, cfg.JWTSecret)
```

**Architectural layers:**
```
handler (HTTP "bouncer") -- validates requests
   ↓
repository (data access layer) -- talks to database
   ↓
database (PostgreSQL) -- stores users
```

- `repo` is a helper object that knows how to query the database
- `handler` receives HTTP requests and uses `repo` to get/save data

```go
	// Step 8: Create the web server (Gin router)
	router := gin.Default()

	// Step 9: Add CORS middleware (allow requests from other domains)
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
```

**What's CORS?**
- **Cross-Origin Resource Sharing**: Allows your React frontend (port 3000) to talk to this service (port 8081)
- Without CORS, the browser blocks cross-port requests for security
- `"*"` means "allow requests from ANY domain" (OK for development, risky for production)

```go
	// Step 10: Add health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "auth"})
	})
```

**What does this do?**
- Creates an HTTP endpoint: `GET http://localhost:8081/health`
- Returns `{"status": "ok", "service": "auth"}`
- Used to check: "Is the auth service running?"

```go
	// Step 11: Register all API routes
	routes.Setup(router, handler, cfg.JWTSecret)

	// Step 12: Start listening on port 8081
	log.Printf("Auth service starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
```

**In plain English:**
- Set up all routes (login, register, etc.)
- Start the HTTP server on port 8081
- Log "Auth service starting on port 8081"
- If something breaks, crash with an error

---

### 2. The User Model (Database Structure)

```go
// services/auth/internal/models/user.go

type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Name         string     `gorm:"size:255;not null" json:"name"`
	Email        string     `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash string     `gorm:"size:255;not null" json:"-"`
	Role         string     `gorm:"size:50;not null" json:"role"`
	StationID    *uuid.UUID `gorm:"type:uuid" json:"station_id,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
```

**What each field means:**

| Field | Purpose | Notes |
|-------|---------|-------|
| `ID` | Unique identifier | UUID = Universally Unique Identifier (like `550e8400-e29...`) |
| `Name` | User's full name | Max 255 characters |
| `Email` | Email address | Unique (no two users with same email); used for login |
| `PasswordHash` | Encrypted password | Never stored as plain text! `json:"-"` means hide from JSON |
| `Role` | User's permission level | e.g., "admin", "ambulance_driver" |
| `StationID` | Associated station (optional) | `*uuid.UUID` = pointer; can be nil |
| `CreatedAt` | Timestamp of account creation | Auto-set by GORM |
| `UpdatedAt` | Timestamp of last update | Auto-set by GORM |

**GORM Tags Explained:**
- `gorm:"type:uuid;primaryKey"` → Create a UUID column; make it the primary key
- `gorm:"size:255;not null"` → String column, max 255 chars, required
- `gorm:"uniqueIndex;not null"` → Create unique index on this column (no duplicates)
- `` json:"-"` `` → Don't include this field when converting struct to JSON

**How GORM creates the database table:**
```sql
-- What GORM creates automatically
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    station_id UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

### 3. The Login Handler (Request → Response)

```go
// services/auth/internal/handlers/auth_handler.go

type AuthHandler struct {
	repo      *repository.UserRepository
	jwtSecret string
}

func NewAuthHandler(repo *repository.UserRepository, jwtSecret string) *AuthHandler {
	return &AuthHandler{repo: repo, jwtSecret: jwtSecret}
}
```

**What's this?**
- `AuthHandler` is the HTTP endpoint handler
- It has two fields:
  - `repo`: knows how to query the database
  - `jwtSecret`: secret key for signing JWT tokens
- `NewAuthHandler()` is a constructor (creates a new AuthHandler)

```go
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}
```

**What's this?**
- Defines the shape of the JSON the frontend sends when logging in
- `binding:"required,email"` means: "this field is required and must be a valid email"
- Example: `{"email": "user@example.com", "password": "password123"}`

```go
// Login authenticates a user and returns JWT tokens
func (h *AuthHandler) Login(c *gin.Context) {
	// Step 1: Parse the incoming JSON request
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
```

**Breaking down:**
- `LoginRequest` is instantiated from the HTTP body
- If JSON is invalid (e.g., missing email), return HTTP 400 Bad Request
- `c.JSON(status, object)` sends a JSON response

**Example of bad request:**
```
Request: POST /auth/login
Body: {} (empty)

Response: 400 Bad Request
Body: {"error": "email is required"}
```

```go
	// Step 2: Find the user by email
	user, err := h.repo.FindByEmail(req.Email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}
```

**What's happening?**
- Query the database: "Give me the user with this email"
- If not found, return HTTP 401 Unauthorized
- Note: We say "Invalid email or **password**" (not "Invalid email") for security (don't reveal which users exist)

```go
	// Step 3: Compare the provided password with the stored hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}
```

**Why hash compare?**
- We NEVER stored the plain password! We stored a HASH.
- When user provides password, we hash it the same way and compare
- If hashes match, password is correct

**Simple diagram:**
```
User enters password: "SecurePass123"
                ↓
bcrypt.GenerateFromPassword() → $2a$12$M9YIczyVe19u...
                ↓
Stored in database as: $2a$12$M9YIczyVe19u...

User logs in with: "SecurePass123"
                ↓
bcrypt.CompareHashAndPassword() with stored hash
                ↓
Match? → Yes! ✓
```

```go
	// Step 4: Generate JWT tokens
	tokens, err := h.generateTokens(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	// Step 5: Send tokens back to frontend
	c.JSON(http.StatusOK, tokens)
}
```

**What `generateTokens()` does:**
```go
func (h *AuthHandler) generateTokens(user *models.User) (*TokenResponse, error) {
	// Create access token (expires in 15 minutes)
	accessExp := time.Now().Add(15 * time.Minute)
	
	// Create JWT token with claims
	accessClaims := jwt.MapClaims{
		"sub": user.ID.String(),              // subject (user ID)
		"email": user.Email,                  // user's email
		"role": user.Role,                    // user's role
		"exp": accessExp.Unix(),              // expiration timestamp
		"iat": time.Now().Unix(),             // issued at
	}
	
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenStr, _ := accessToken.SignedString([]byte(h.jwtSecret))
	
	// Create refresh token (stored in database)
	refreshToken := // ... random token
	
	return &TokenResponse{
		AccessToken: accessTokenStr,
		RefreshToken: refreshToken,
		ExpiresIn: 900, // 15 minutes in seconds
	}, nil
}
```

**JWT Token Example:**

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3MTAyNDU0MDB9.
EH2uF7Ub_QdB6nV8L0d3...
```

Three parts:
1. **Header** (encrypted): `{"alg":"HS256","typ":"JWT"}`
2. **Payload** (encrypted): `{"sub":"user-id","email":"user@example.com","role":"admin","exp":1710245400}`
3. **Signature** (encrypted secret): Proves this token wasn't tampered with

---

### 4. The Repository Pattern (Database Access)

```go
// services/auth/internal/repository/user_repo.go

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}
```

**What's a repository?**
- A **helper object** that knows all the database queries
- Think of it as a **"database translator"**
- Instead of writing SQL everywhere, we call repo methods

```go
// Create a new user
func (r *UserRepository) Create(user *models.User) error {
	return r.db.Create(user).Error
}
```

**In plain English:**
- Take a `User` struct
- GORM converts it to SQL: `INSERT INTO users (name, email, password_hash, ...) VALUES (...)`
- Execute the INSERT
- Return any error that occurred

```go
// Find a user by email
func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}
```

**Translating the GORM query:**

| GORM Code | SQL | Meaning |
|-----------|-----|---------|
| `r.db` | Database connection | Start building a query |
| `.Where("email = ?", email)` | `WHERE email = 'user@ex.com'` | Filter row by email |
| `.First(&user)` | `LIMIT 1` | Get only the first result |
| `.Error` | Error from database | Did the query work? |

**Full SQL generated:**
```sql
SELECT * FROM users WHERE email = ? LIMIT 1;
```

```go
// Find all users
func (r *UserRepository) FindAll() ([]models.User, error) {
	var users []models.User
	err := r.db.Order("created_at DESC").Find(&users).Error
	return users, err
}
```

**SQL generated:**
```sql
SELECT * FROM users ORDER BY created_at DESC;
```

```go
// Update a user
func (r *UserRepository) Update(user *models.User) error {
	return r.db.Save(user).Error
}
```

**SQL generated:**
```sql
UPDATE users 
SET name = ?, email = ?, role = ?, updated_at = ?
WHERE id = ?;
```

**Why use a repository?**
```
❌ Bad approach: SQL all over the code
  handler → "SELECT * FROM users WHERE email = ?"
  service → "SELECT * FROM users WHERE role = 'admin'"
  Problem: Duplicated SQL, hard to maintain

✅ Good approach: Repository pattern
  handler → repo.FindByEmail(email)
  service → repo.FindAllByRole("admin")
  Benefit: All database logic in one place
```

---

## Part 2: INCIDENT CREATION → DISPATCH → REALTIME

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Frontend user reports emergency incident via form            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. POST /incidents with lat/lng sent to Incident Service        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. Incident Handler validates & saves to Database               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. AutoDispatch Service:                                        │
│    a) Find nearest station using PostGIS                        │
│    b) Call Dispatch Service to find available vehicle           │
│    c) Update incident with assigned station                     │
│    d) Publish events to RabbitMQ                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ↓                       ↓
    ┌─────────────┐         ┌──────────────┐
    │ RabbitMQ    │         │ RabbitMQ     │
    │ incident.   │         │ incident.    │
    │ created     │         │ dispatched   │
    └────┬────────┘         └────┬─────────┘
         │                       │
    ┌────┴─────────────────┬─────┴────────┐
    │                      │              │
    ↓                      ↓              ↓
┌──────────┐      ┌──────────────┐    ┌────────────┐
│Analytics │      │ Realtime     │    │ Realtime   │
│Service   │      │ Gateway      │    │ Gateway    │
│Consumes  │      │ Consumes &   │    │ Broadcasts│
│- Updates │      │ prepares to  │    │ WebSocket │
│  metrics │      │ broadcast    │    │ events    │
└──────────┘      └──────────────┘    └─────┬──────┘
                                            │
                                            ↓
                                   ┌─────────────────────┐
                                   │ Browser WebSocket   │
                                   │ Receives live       │
                                   │ incident updates    │
                                   └─────────────────────┘
```

---

### Step-by-Step Code Walkthrough

#### Step 1: Create Incident (Incident Service Handler)

```go
// Frontend sends:
// POST http://localhost:8082/incidents
// {
//   "citizen_name": "John Doe",
//   "citizen_phone": "+233XX...",
//   "incident_type": "medical",
//   "latitude": 5.6296,
//   "longitude": -0.1692,
//   "notes": "Patient having chest pain"
// }
```

#### Step 2: Incident Handler Creates Record

```go
// Handler receives the request, validates it, saves to database:
incident := &Incident{
    CitizenName: "John Doe",
    IncidentType: "medical",
    Latitude: 5.6296,
    Longitude: -0.1692,
    Status: "created",  // initial status
    CreatedBy: userID,
}

// Save to database
incidentRepo.Create(incident)

// Response: 201 Created
// {
//   "id": "650e8400-e29b-41d4-a716-446655440100",
//   "status": "created",
//   "incident_type": "medical",
//   ...
// }
```

#### Step 3: Auto-Dispatch Logic (The Magic!)

```go
// services/incident/internal/services/dispatch_logic.go

func (s *DispatchService) AutoDispatch(incident *models.Incident) error {
	// STEP A: Map incident type to station type
	// "medical" → "hospital"
	// "fire" → "fire"
	// "crime" → "police"
	stationType := models.MapIncidentTypeToStationType(incident.IncidentType)
	
	// STEP B: Find nearest available station using PostGIS
	// This is the geographic "nearest neighbor" query!
	station, err := s.stationRepo.FindNearestAvailable(
		incident.Latitude,    // 5.6296
		incident.Longitude,   // -0.1692
		stationType,          // "hospital"
	)
```

**What's PostGIS?**
- PostgreSQL extension for geographic queries
- Instead of: "Get all hospitals" then calculate distance for each
- PostGIS does: "Get the hospital closest to this point" (in database!)

**Example PostGIS query:**
```sql
SELECT id, name, location
FROM stations
WHERE type = 'hospital'
  AND status = 'available'
ORDER BY ST_Distance(location, ST_Point(-0.1692, 5.6296))
LIMIT 1;
```

Translation: "Find the available hospital closest to coordinates (5.6296, -0.1692)"

```go
	// STEP C: Try to find an available vehicle at that station
	vehicle, err := s.findAvailableVehicle(station.ID, stationType)
	if err != nil {
		log.Printf("No available vehicle at station %s: %v", station.ID, err)
		// Still continue; assign just the station
	}
```

**This calls the Dispatch Service:**
```go
func (s *DispatchService) findAvailableVehicle(stationID uuid.UUID, stationType string) (*AvailableVehicleResponse, error) {
	// Make HTTP call to Dispatch Service
	url := fmt.Sprintf("http://localhost:8083/vehicles/available?station_id=%s", stationID)
	
	// HTTP GET request
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("dispatch service unavailable: %w", err)
	}
	
	// Parse response
	// {
	//   "id": "850e...",
	//   "station_id": "750e...",
	//   "vehicle_type": "ambulance"
	// }
}
```

**This is Inter-Service HTTP Communication!**
```
┌────────────────────┐
│ Incident Service   │
│ (Port 8082)        │
│                    │
│ "Hey Dispatch!     │
│  Give me an        │
│  available vehicle │
│  at station 750e"  │
└────────┬───────────┘
         │
         │ HTTP GET
         │ http://localhost:8083/vehicles/available?station_id=750e...
         ↓
┌────────────────────┐
│ Dispatch Service   │
│ (Port 8083)        │
│                    │
│ "Sure! Here's      │
│  ambulance GN-2026 │
│  it's available"   │
└────────────────────┘
```

```go
	// STEP D: Update incident with assignment
	incident.AssignedUnitID = &station.ID
	incident.AssignedUnitType = stationType
	incident.Status = "dispatched"
	incident.DispatchedAt = time.Now()
	
	// Save to database
	s.incidentRepo.Update(incident)
```

**SQL generated:**
```sql
UPDATE incidents
SET assigned_unit_id = '750e...',
    assigned_unit_type = 'hospital',
    status = 'dispatched',
    dispatched_at = NOW(),
    updated_at = NOW()
WHERE id = '650e...';
```

```go
	// STEP E: Publish events to RabbitMQ
	if s.publisher != nil {
		// Event 1: "incident.created"
		s.publisher.PublishIncidentCreated(incident)

		// Event 2: "incident.dispatched"
		s.publisher.PublishIncidentDispatched(
			incident,
			station.ID.String(),
			vehicle.ID,  // may be empty if no vehicle found
		)
	}
	
	return nil
}
```

---

### Step 4: RabbitMQ events propagate

**Event 1: `incident.created` → Analytics Service**

```json
{
    "event_type": "incident.created",
    "event_id": "evt-550e8400-...",
    "timestamp": "2026-03-12T14:35:00Z",
    "incident_id": "650e8400-...",
    "incident_type": "medical",
    "severity": "high",
    "location": {
        "latitude": 5.6296,
        "longitude": -0.1692
    },
    "reported_by": "550e8400-..."
}
```

**Analytics Service receives and:**
```go
func (c *Consumer) handleIncidentCreated(msg amqp.Delivery) {
	// Extract region from coordinates
	// Using a coordinate-to-region mapping:
	// 5.6296, -0.1692 → "Central Accra"
	
	// Create response_time record in database
	responseTime := &models.ResponseTime{
		IncidentID: eventData.IncidentID,
		IncidentType: eventData.IncidentType,
		Region: "Central Accra",
		Status: "created",  // Not yet dispatched
	}
	db.Create(responseTime)
	
	// Also update aggregated metrics
	// (for the analytics dashboard)
}
```

**Event 2: `incident.dispatched` → Realtime Gateway**

```json
{
    "event_type": "incident.dispatched",
    "event_id": "evt-550e8400-...",
    "timestamp": "2026-03-12T14:35:15Z",
    "incident_id": "650e8400-...",
    "station_id": "750e...",
    "assigned_vehicles": [{
        "vehicle_id": "850e...",
        "registration_number": "GN-2026-001",
        "vehicle_type": "ambulance",
        "driver_name": "Kwame Asante"
    }],
    "estimated_arrival_seconds": 480
}
```

**Realtime Gateway receives and:**
```go
func (h *Hub) handleIncidentDispatched(msg amqp.Delivery) {
	var event IncidentDispatchedEvent
	json.Unmarshal(msg.Body, &event)
	
	// Prepare WebSocket message
	wsEvent := map[string]interface{}{
		"type": "incident.dispatched",
		"timestamp": event.Timestamp,
		"data": event,
	}
	
	// Broadcast to all connected browsers
	// (Filter by role/region if needed)
	h.Broadcast <- wsEvent
}
```

---

### Step 5: Browser Receives Live Updates via WebSocket

```javascript
// Frontend JavaScript
const ws = new WebSocket('ws://localhost:8085?token=JWT_TOKEN');

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'incident.dispatched') {
        // Update UI to show:
        // "Ambulance GN-2026-001 assigned"
        // "Estimated arrival: 8 minutes"
        
        updateIncidentCard(message.data);
    }
};
```

---

## Part 3: GORM DATABASE PATTERNS

### What is an ORM?

**ORM = Object-Relational Mapping**

Think of it like: **"Translator between Go objects and SQL"**

❌ **Without ORM (Manual SQL):**
```go
// You have to write SQL strings yourself
rows, err := db.Query("SELECT id, name, email FROM users WHERE role = ?", "admin")
if err != nil {
    // Handle error
}
defer rows.Close()

var users []User
for rows.Next() {
    var u User
    rows.Scan(&u.ID, &u.Name, &u.Email)  // Manually map columns
    users = append(users, u)
}
```

✅ **With GORM (Object-Oriented):**
```go
var users []User
db.Where("role = ?", "admin").Find(&users)
// GORM handles all the SQL and mapping!
```

---

### GORM Pattern 1: Create (INSERT)

```go
user := &User{
    Name: "John Doe",
    Email: "john@example.com",
    PasswordHash: "$2a$12$...",  // bcrypt hash
    Role: "admin",
}

// GORM method
err := repo.Create(user)
```

**What GORM does internally:**

1. **Generates SQL:**
   ```sql
   INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7);
   ```

2. **Sets auto-generated fields:**
   - `ID`: Calls `user.BeforeCreate()` which generates UUID if not set
   - `CreatedAt`: Sets to current time
   - `UpdatedAt`: Sets to current time

3. **Executes the SQL:** Inserts the user into `users` table

4. **Returns any errors**

---

### GORM Pattern 2: Query Single Record (SELECT ... LIMIT 1)

```go
// Find user by email
func (r *UserRepository) FindByEmail(email string) (*User, error) {
    var user User
    err := r.db.Where("email = ?", email).First(&user).Error
    if err != nil {
        return nil, err
    }
    return &user, nil
}
```

**Breaking it down:**

| Method | Purpose | SQL |
|--------|---------|-----|
| `r.db` | Start a query | — |
| `.Where("email = ?", email)` | Add WHERE clause | `WHERE email = 'john@ex.com'` |
| `.First(&user)` | Get first result | `LIMIT 1` |
| `.Error` | Access any errors | Check if query succeeded |

**Full SQL:**
```sql
SELECT * FROM users WHERE email = $1 LIMIT 1;
```

**Error handling:**
```go
// If no rows found
err == gorm.ErrRecordNotFound  // Special GORM error

// In our handler:
user, err := repo.FindByEmail("non@existent.com")
if err != nil {
    // err is gorm.ErrRecordNotFound
    c.JSON(http.StatusUnauthorized, "Invalid email")
}
```

---

### GORM Pattern 3: Query Multiple Records (SELECT with pagination)

```go
// From IncidentService: Get incidents with filtering
func (r *IncidentRepository) FindActive() ([]Incident, error) {
    var incidents []Incident
    err := r.db.
        Where("status IN ?", []string{"created", "dispatched", "in_progress"}).
        Order("created_at DESC").
        Limit(50).
        Offset(0).
        Find(&incidents).Error
    return incidents, err
}
```

**Step-by-step:**

1. `r.db` → Start query builder
2. `.Where("status IN ?", [...])` → `WHERE status IN ('created', 'dispatched', 'in_progress')`
3. `.Order("created_at DESC")` → `ORDER BY created_at DESC`
4. `.Limit(50)` → `LIMIT 50`
5. `.Offset(0)` → `OFFSET 0`
6. `.Find(&incidents)` → Execute SELECT and populate slice
7. `.Error` → Get any errors

**Generated SQL:**
```sql
SELECT * FROM incidents
WHERE status IN ('created', 'dispatched', 'in_progress')
ORDER BY created_at DESC
LIMIT 50
OFFSET 0;
```

---

### GORM Pattern 4: Update (UPDATE)

```go
// Update incident status
incident.Status = "in_progress"
incident.UpdatedAt = time.Now()

err := repo.Update(incident)
```

**What GORM does:**

1. **GORM knows the primary key** (ID field with `gorm:"primaryKey"`)
2. **Generates SQL:**
   ```sql
   UPDATE incidents
   SET status = $1, updated_at = $2
   WHERE id = $3;
   ```
3. **Executes and returns errors**

**Behind the scenes:**
```go
func (r *IncidentRepository) Update(incident *Incident) error {
    return r.db.Save(incident).Error
}
```

`.Save()` is smart:
- If `ID` is set → UPDATE
- If `ID` is not set → INSERT

---

### GORM Pattern 5: Delete (DELETE)

```go
// Delete a user's refresh tokens
err := repo.DeleteUserRefreshTokens(userID)
```

**Implementation:**
```go
func (r *UserRepository) DeleteUserRefreshTokens(userID uuid.UUID) error {
    return r.db.Where("user_id = ?", userID).Delete(&RefreshToken{}).Error
}
```

**Generated SQL:**
```sql
DELETE FROM refresh_tokens WHERE user_id = $1;
```

---

### GORM Pattern 6: Spatial Queries (PostGIS)

```go
// Find nearest hospital to incident location
func (r *StationRepository) FindNearestAvailable(lat, lng float64, stationType string) (*Station, error) {
    var station Station
    err := r.db.
        Where("type = ? AND status = 'available'", stationType).
        Order("ST_Distance(location, ST_Point(?, ?))", lng, lat).
        Limit(1).
        First(&station).Error
    return &station, err
}
```

**What's magical here?**

- `ST_Point(?, ?)` → Creates a geographic point from coordinates
- `ST_Distance()` → Calculates distance between two points
- `Order("ST_Distance(...)")` → Sort by distance (nearest first)
- `Limit(1)` → Get only the closest one

**Generated SQL:**
```sql
SELECT * FROM stations
WHERE type = 'hospital' AND status = 'available'
ORDER BY ST_Distance(location, ST_Point(-0.1692, 5.6296))
LIMIT 1;
```

---

### GORM Pattern 7: Relationships (Foreign Keys)

```go
type User struct {
    ID       uuid.UUID
    Name     string
    StationID *uuid.UUID  // Foreign key
}

type Station struct {
    ID       uuid.UUID
    Name     string
}
```

**When you want to load related data:**
```go
// Load user with their station
var user User
r.db.Preload("Station").First(&user)  // Executes 2 queries
```

**GORM generates:**
```sql
-- Query 1: Get the user
SELECT * FROM users WHERE id = $1;

-- Query 2: Get the related station
SELECT * FROM stations WHERE id = $1;
```

---

## Summary Cheat Sheet

### Auth Service Flow
```
1. Register → Hash password with bcrypt → Save to DB
2. Login → Find user → Compare password hash → Generate JWT
3. JWT contains: user_id, email, role, expiration
4. Frontend stores JWT in localStorage
5. Frontend sends JWT in Authorization header for protected requests
```

### Incident → Dispatch → Realtime Flow
```
1. Create incident with lat/lng
2. AutoDispatch triggered:
   a. Find nearest station (PostGIS)
   b. Find available vehicle (HTTP to Dispatch Service)
   c. Update incident status
   d. Publish events to RabbitMQ
3. Events propagate:
   - Analytics: Update metrics
   - Realtime: Broadcast to browsers
4. Frontend receives live update via WebSocket
```

### GORM Patterns
```
Create:   db.Create(&obj)
Read:     db.Where(...).First(&obj)
List:     db.Where(...).Find(&objs)
Update:   db.Save(&obj)
Delete:   db.Where(...).Delete(&obj)
Spatial:  db.Order("ST_Distance(...)")
```

---

## Common Beginner Mistakes & How to Avoid Them

### ❌ Mistake 1: Storing plain passwords
```go
// DON'T DO THIS:
user.Password = "SecurePass123"  // Plain text!

// DO THIS:
hash, _ := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
user.PasswordHash = string(hash)
```

### ❌ Mistake 2: Exposing sensitive fields in JSON
```go
type User struct {
    PasswordHash string `json:"-"`  // Hide from JSON!
    Email string `json:"email"`      // Include this
}
```

### ❌ Mistake 3: Not checking errors
```go
// DON'T:
user, _ := repo.FindByEmail(email)  // Ignores error!

// DO:
user, err := repo.FindByEmail(email)
if err != nil {
    // Handle missing user
    c.JSON(http.StatusNotFound, "User not found")
    return
}
```

### ❌ Mistake 4: SQL injection
```go
// DON'T:
db.Where("email = " + email).Find(&users)  // SQL injection!

// DO:
db.Where("email = ?", email).Find(&users)  // Safe parameterization
```

### ❌ Mistake 5: Synchronous all the way
```go
// DON'T (blocks until complete):
incident := createIncident(...)
dispatchService.Send(incident)      // Wait for response
updateAnalytics(incident)            // Wait for response
// Takes 30 seconds total

// DO (async via RabbitMQ):
incident := createIncident(...)
publisher.Publish("incident.created", incident)  // Fire and forget!
// Returns immediately; services process in background
```

