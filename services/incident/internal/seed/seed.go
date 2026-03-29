package seed

import (
	"log"
	"os"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/incident/internal/models"
)

const (
	policeStationID    = "11111111-1111-1111-1111-111111111111"
	fireStationID      = "22222222-2222-2222-2222-222222222222"
	hospitalStationID  = "33333333-3333-3333-3333-333333333333"
	kaneshiePoliceID   = "44444444-4444-4444-4444-444444444444"
	makolaFireID       = "55555555-5555-5555-5555-555555555555"
	ridgeHospitalID    = "66666666-6666-6666-6666-666666666666"
)

func Run(db *gorm.DB) error {
	// ── Cleanup logic ──────────────────────────────────────────────────────────
	if os.Getenv("CLEAN_START") == "true" {
		log.Println("CLEAN_START=true: Truncating incidents table...")
		// Use CASCADE to handle any potential foreign key constraints (e.g. from analytics)
		if err := db.Exec("TRUNCATE TABLE incidents CASCADE").Error; err != nil {
			log.Printf("Error truncating incidents: %v", err)
		}
	}

	if os.Getenv("SEED_DEMO_DATA") == "false" {
		return nil
	}

	stations := []models.ResponderStation{
		{
			ID:                uuid.MustParse(policeStationID),
			Name:              "Legon Police Post",
			Type:              models.StationTypePolice,
			Latitude:          5.6514,
			Longitude:         -0.1869,
			IsAvailable:       true,
			ContactPhone:      "+233200000001",
		},
		{
			ID:                uuid.MustParse(fireStationID),
			Name:              "Accra North Fire Station",
			Type:              models.StationTypeFire,
			Latitude:          5.6502,
			Longitude:         -0.1844,
			IsAvailable:       true,
			ContactPhone:      "+233200000002",
		},
		{
			ID:                uuid.MustParse(hospitalStationID),
			Name:              "University Hospital Legon",
			Type:              models.StationTypeHospital,
			Latitude:          5.6518,
			Longitude:         -0.1875,
			IsAvailable:       true,
			ContactPhone:      "+233200000003",
			TotalCapacity:     120,
			AvailableCapacity: 42,
		},
		{
			ID:                uuid.MustParse(kaneshiePoliceID),
			Name:              "Kaneshie Police Station",
			Type:              models.StationTypePolice,
			Latitude:          5.5670,
			Longitude:         -0.2300,
			IsAvailable:       true,
			ContactPhone:      "+233200000004",
		},
		{
			ID:                uuid.MustParse(makolaFireID),
			Name:              "Makola Fire Station",
			Type:              models.StationTypeFire,
			Latitude:          5.5480,
			Longitude:         -0.2050,
			IsAvailable:       true,
			ContactPhone:      "+233200000005",
		},
		{
			ID:                uuid.MustParse(ridgeHospitalID),
			Name:              "Ridge Hospital (GARH)",
			Type:              models.StationTypeHospital,
			Latitude:          5.5600,
			Longitude:         -0.2000,
			IsAvailable:       true,
			ContactPhone:      "+233200000006",
			TotalCapacity:     250,
			AvailableCapacity: 85,
		},
	}

	for _, station := range stations {
		var existing models.ResponderStation
		if err := db.Where("id = ?", station.ID).First(&existing).Error; err == nil {
			// Update existing station fields in case they changed in seed
			db.Model(&existing).Updates(station)
			continue
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		stationCopy := station
		if err := db.Create(&stationCopy).Error; err != nil {
			return err
		}
	}

	return nil
}
