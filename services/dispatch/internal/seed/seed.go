package seed

import (
	"log"
	"os"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/dispatch/internal/models"
)

func Run(db *gorm.DB) error {
	// ── Cleanup logic ──────────────────────────────────────────────────────────
	if os.Getenv("CLEAN_START") == "true" {
		log.Println("CLEAN_START=true: Truncating vehicles and location history tables...")
		
		// Use Exec to run raw truncation commands
		if err := db.Exec("TRUNCATE TABLE location_histories").Error; err != nil {
			log.Printf("Error truncating location_histories: %v", err)
		}
		
		if err := db.Exec("TRUNCATE TABLE vehicles CASCADE").Error; err != nil {
			log.Printf("Error truncating vehicles: %v", err)
		}
	}

	// Skip vehicle creation if SEED_DEMO_DATA=false OR SEED_VEHICLES=false
	if os.Getenv("SEED_DEMO_DATA") == "false" || os.Getenv("SEED_VEHICLES") == "false" {
		log.Println("Seeding demo vehicles skipped.")
		return nil
	}

	// (The demo vehicles list is retained below but will be skipped due to SEED_VEHICLES=false)
	vehicles := []models.Vehicle{
		{
			ID:           uuid.MustParse("44444444-4444-4444-4444-444444444444"),
			StationID:    uuid.MustParse("33333333-3333-3333-3333-333333333333"), // Hospital
			StationType:  "hospital",
			VehicleType:  models.VehicleTypeAmbulance,
			LicensePlate: "GW-AMB-101",
			DriverName:   "Kojo Mensah",
			Status:       models.VehicleAvailable,
			Latitude:     5.6518,
			Longitude:    -0.1875,
		},
	}

	for _, vehicle := range vehicles {
		var existing models.Vehicle
		if err := db.Where("id = ?", vehicle.ID).First(&existing).Error; err == nil {
			continue
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		vehicleCopy := vehicle
		if err := db.Create(&vehicleCopy).Error; err != nil {
			return err
		}
	}

	return nil
}
