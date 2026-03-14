package seed

import (
	"os"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/incident/internal/models"
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

	stations := []models.ResponderStation{
		{
			ID:                uuid.MustParse(policeStationID),
			Name:              "Legon Police Post",
			Type:              models.StationTypePolice,
			Latitude:          5.6514,
			Longitude:         -0.1869,
			IsAvailable:       true,
			ContactPhone:      "+233200000001",
			TotalCapacity:     0,
			AvailableCapacity: 0,
		},
		{
			ID:                uuid.MustParse(fireStationID),
			Name:              "Accra North Fire Station",
			Type:              models.StationTypeFire,
			Latitude:          5.6502,
			Longitude:         -0.1844,
			IsAvailable:       true,
			ContactPhone:      "+233200000002",
			TotalCapacity:     0,
			AvailableCapacity: 0,
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
	}

	for _, station := range stations {
		var existing models.ResponderStation
		if err := db.Where("id = ?", station.ID).First(&existing).Error; err == nil {
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
