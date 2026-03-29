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
	policeStationID    = "11111111-1111-1111-1111-111111111111"
	fireStationID      = "22222222-2222-2222-2222-222222222222"
	hospitalStationID  = "33333333-3333-3333-3333-333333333333"
	kaneshiePoliceID   = "44444444-4444-4444-4444-444444444444"
	makolaFireID       = "55555555-5555-5555-5555-555555555555"
	ridgeHospitalID    = "66666666-6666-6666-6666-666666666666"
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

	pID := uuid.MustParse(policeStationID)
	fID := uuid.MustParse(fireStationID)
	hID := uuid.MustParse(hospitalStationID)
	kpID := uuid.MustParse(kaneshiePoliceID)
	mfID := uuid.MustParse(makolaFireID)
	rhID := uuid.MustParse(ridgeHospitalID)

	users := []demoUser{
		// Administrators
		{Name: "System Administrator", Email: demoEmail("system_admin"), Role: models.RoleSystemAdmin},
		{Name: "Hospital Administrator", Email: demoEmail("hospital_admin"), Role: models.RoleHospitalAdmin, StationID: &hID},
		{Name: "Police Administrator", Email: demoEmail("police_admin"), Role: models.RolePoliceAdmin, StationID: &pID},
		{Name: "Fire Administrator", Email: demoEmail("fire_admin"), Role: models.RoleFireAdmin, StationID: &fID},

		// Drivers / Units
		{Name: "Legon Ambulance Driver", Email: demoEmail("ambulance_driver"), Role: models.RoleAmbulanceDriver, StationID: &hID},
		{Name: "Ridge Ambulance Driver", Email: demoEmail("ridge_ambulance_driver"), Role: models.RoleAmbulanceDriver, StationID: &rhID},
		{Name: "Kaneshie Police Unit", Email: demoEmail("police_driver"), Role: models.RolePoliceAdmin, StationID: &kpID},
		{Name: "Makola Fire Unit", Email: demoEmail("fire_driver"), Role: models.RoleFireAdmin, StationID: &mfID},
	}

	for _, entry := range users {
		var existing models.User
		if err := db.Where("email = ?", entry.Email).First(&existing).Error; err == nil {
			// Update if exists but station changed
			db.Model(&existing).Updates(models.User{StationID: entry.StationID, Name: entry.Name})
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

	log.Printf("Auth demo users ensured with password: %s", defaultPassword)
	return nil
}

func demoEmail(role string) string {
	return role + "@dispatch.local"
}
