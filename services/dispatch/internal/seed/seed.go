package seed

import (
	"os"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/dispatch/internal/models"
)

const (
	policeStationID   = "11111111-1111-1111-1111-111111111111"
	fireStationID     = "22222222-2222-2222-2222-222222222222"
	hospitalStationID = "33333333-3333-3333-3333-333333333333"
)

func Run(db *gorm.DB) error {
	if os.Getenv("SEED_DEMO_DATA") == "false" {
		return nil
	}

	vehicles := []models.Vehicle{
		{
			ID:           uuid.MustParse("44444444-4444-4444-4444-444444444444"),
			StationID:    uuid.MustParse(hospitalStationID),
			StationType:  "hospital",
			VehicleType:  models.VehicleTypeAmbulance,
			LicensePlate: "GW-AMB-101",
			DriverName:   "Kojo Mensah",
			Status:       models.VehicleAvailable,
			Latitude:     5.6518,
			Longitude:    -0.1875,
		},
		{
			ID:           uuid.MustParse("55555555-5555-5555-5555-555555555555"),
			StationID:    uuid.MustParse(fireStationID),
			StationType:  "fire",
			VehicleType:  models.VehicleTypeFireTruck,
			LicensePlate: "GW-FIR-202",
			DriverName:   "Efua Boateng",
			Status:       models.VehicleAvailable,
			Latitude:     5.6502,
			Longitude:    -0.1844,
		},
		{
			ID:           uuid.MustParse("66666666-6666-6666-6666-666666666666"),
			StationID:    uuid.MustParse(policeStationID),
			StationType:  "police",
			VehicleType:  models.VehicleTypePoliceCar,
			LicensePlate: "GW-POL-303",
			DriverName:   "Ama Owusu",
			Status:       models.VehicleAvailable,
			Latitude:     5.6514,
			Longitude:    -0.1869,
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
