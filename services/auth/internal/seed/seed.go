package seed

import (
	"log"
	"os"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"emergency-dispatch/services/auth/internal/models"
)

const (
	policeStationID   = "11111111-1111-1111-1111-111111111111"
	fireStationID     = "22222222-2222-2222-2222-222222222222"
	hospitalStationID = "33333333-3333-3333-3333-333333333333"
)

type demoUser struct {
	Name      string
	Email     string
	Role      string
	StationID *uuid.UUID
}

func Run(db *gorm.DB) error {
	if os.Getenv("SEED_DEMO_DATA") == "false" {
		return nil
	}

	defaultPassword := os.Getenv("DEMO_USER_PASSWORD")
	if defaultPassword == "" {
		defaultPassword = "dispatch1234"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(defaultPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	policeID := uuid.MustParse(policeStationID)
	fireID := uuid.MustParse(fireStationID)
	hospitalID := uuid.MustParse(hospitalStationID)

	users := []demoUser{
		{Name: "System Administrator", Email: demoEmail("system_admin"), Role: models.RoleSystemAdmin},
		{Name: "Hospital Administrator", Email: demoEmail("hospital_admin"), Role: models.RoleHospitalAdmin, StationID: &hospitalID},
		{Name: "Police Administrator", Email: demoEmail("police_admin"), Role: models.RolePoliceAdmin, StationID: &policeID},
		{Name: "Fire Administrator", Email: demoEmail("fire_admin"), Role: models.RoleFireAdmin, StationID: &fireID},
		{Name: "Ambulance Driver", Email: demoEmail("ambulance_driver"), Role: models.RoleAmbulanceDriver, StationID: &hospitalID},
	}

	for _, entry := range users {
		var existing models.User
		if err := db.Where("email = ?", entry.Email).First(&existing).Error; err == nil {
			continue
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		user := models.User{
			Name:         entry.Name,
			Email:        entry.Email,
			PasswordHash: string(hash),
			Role:         entry.Role,
			StationID:    entry.StationID,
		}
		if err := db.Create(&user).Error; err != nil {
			return err
		}
	}

	log.Printf("Auth demo users ensured. Login with %s / %s", demoEmail("system_admin"), defaultPassword)
	return nil
}

func demoEmail(role string) string {
	return role + "@dispatch.local"
}
