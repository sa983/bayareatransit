// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// 511.org API key
const API_KEY = '825a0905-cdd2-4179-b699-f5f46b26528e';
// BART API key - using their public key, but you can register for your own
const BART_API_KEY = 'MW9S-E7SL-26DU-VV8V';

// Enable CORS for all requests
app.use(cors());

// Serve static files from the public directory
app.use(express.static('public'));

// Proxy endpoint for operators
app.get('/api/operators', async (req, res) => {
  try {
    const response = await axios.get(`https://api.511.org/transit/operators`, {
      params: {
        api_key: API_KEY,
        format: 'json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching operators:', error.message);
    res.status(500).json({ error: 'Failed to fetch operators' });
  }
});

// Proxy endpoint for vehicle monitoring from 511.org
app.get('/api/vehiclemonitoring/:agency', async (req, res) => {
  try {
    const { agency } = req.params;
    
    // Special handling for BART
    if (agency === 'BA') {
      try {
        const bartData = await getBartVehicleData();
        return res.json(bartData);
      } catch (bartError) {
        console.error(`Error fetching BART data:`, bartError.message);
        // Fall back to 511.org if BART API fails
      }
    }
    
    // Standard 511.org API call for other agencies
    const response = await axios.get(`https://api.511.org/transit/VehicleMonitoring`, {
      params: {
        api_key: API_KEY,
        agency: agency,
        format: 'json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching vehicles for agency ${req.params.agency}:`, error.message);
    res.status(500).json({ error: `Failed to fetch vehicles for agency ${req.params.agency}` });
  }
});

// Proxy endpoint for stops
app.get('/api/stops/:agency', async (req, res) => {
  try {
    const { agency } = req.params;
    
    // Special handling for BART
    if (agency === 'BA') {
      try {
        const bartStations = await getBartStations();
        return res.json(bartStations);
      } catch (bartError) {
        console.error(`Error fetching BART stations:`, bartError.message);
        // Fall back to 511.org if BART API fails
      }
    }
    
    // Standard 511.org API call for other agencies
    const response = await axios.get(`https://api.511.org/transit/stops`, {
      params: {
        api_key: API_KEY,
        operator_id: agency,
        format: 'json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching stops for agency ${req.params.agency}:`, error.message);
    res.status(500).json({ error: `Failed to fetch stops for agency ${req.params.agency}` });
  }
});

// New endpoint specifically for BART GTFS-RT trip updates
app.get('/api/bart/gtfsrt/tripupdate', async (req, res) => {
  try {
    const response = await axios.get(`http://api.bart.gov/gtfsrt/tripupdate.aspx`, {
      responseType: 'arraybuffer' // GTFS-RT feeds are protobuf format
    });
    
    // Forward the binary protobuf data
    res.set('Content-Type', 'application/x-protobuf');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching BART GTFS-RT data:', error.message);
    res.status(500).json({ error: 'Failed to fetch BART GTFS-RT data' });
  }
});

// New endpoint specifically for BART GTFS-RT service alerts
app.get('/api/bart/gtfsrt/alerts', async (req, res) => {
  try {
    const response = await axios.get(`http://api.bart.gov/gtfsrt/alerts.aspx`, {
      responseType: 'arraybuffer' // GTFS-RT feeds are protobuf format
    });
    
    // Forward the binary protobuf data
    res.set('Content-Type', 'application/x-protobuf');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching BART alerts data:', error.message);
    res.status(500).json({ error: 'Failed to fetch BART alerts data' });
  }
});

// New endpoint for BART ETD (Estimated Time of Departure) data
app.get('/api/bart/etd/:station', async (req, res) => {
  try {
    const { station } = req.params;
    const origin = station || 'ALL'; // Use 'ALL' if no station specified
    
    const response = await axios.get(`http://api.bart.gov/api/etd.aspx`, {
      params: {
        cmd: 'etd',
        orig: origin,
        key: BART_API_KEY,
        json: 'y'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching BART ETD data:', error.message);
    res.status(500).json({ error: 'Failed to fetch BART ETD data' });
  }
});

// Helper function to fetch and transform BART station data
async function getBartStations() {
  const response = await axios.get(`http://api.bart.gov/api/stn.aspx`, {
    params: {
      cmd: 'stns',
      key: BART_API_KEY,
      json: 'y'
    }
  });
  
  // Transform BART station data into a format compatible with the app
  const stations = response.data.root.stations.station;
  const geojson = stations.map(station => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [parseFloat(station.gtfs_longitude), parseFloat(station.gtfs_latitude)]
    },
    properties: {
      id: station.abbr,
      name: station.name,
      lines: station.color ? [{ id: station.color }] : []
    }
  }));
  
  return geojson;
}

// Helper function to fetch and transform BART vehicle data from ETD API
async function getBartVehicleData() {
  // Fetch ETD data which includes train estimates
  const etdResponse = await axios.get(`http://api.bart.gov/api/etd.aspx`, {
    params: {
      cmd: 'etd',
      orig: 'ALL',
      key: BART_API_KEY,
      json: 'y'
    }
  });
  
  // Create a Siri-compatible format response for the app
  const siriResponse = {
    Siri: {
      ServiceDelivery: {
        ResponseTimestamp: new Date().toISOString(),
        VehicleMonitoringDelivery: [{
          ResponseTimestamp: new Date().toISOString(),
          ValidUntil: new Date(Date.now() + 30000).toISOString(),
          VehicleActivity: []
        }]
      }
    }
  };
  
  // No direct vehicle position in BART API, but we can create virtual positions
  // based on the ETD data by placing trains near their next station
  if (etdResponse.data.root && etdResponse.data.root.station) {
    const stations = etdResponse.data.root.station;
    
    // Create a map to store station coordinates
    const stationCoordinates = {};
    const stationData = await getBartStationCoordinates();
    
    stationData.forEach(station => {
      stationCoordinates[station.abbr] = {
        lat: station.gtfs_latitude,
        lng: station.gtfs_longitude
      };
    });
    
    // Process each station's ETD data
    stations.forEach(station => {
      const stationAbbr = station.abbr;
      const stationCoord = stationCoordinates[stationAbbr];
      
      if (!stationCoord || !station.etd) {
        return;
      }
      
      // Process each destination's estimates
      if (Array.isArray(station.etd)) {
        station.etd.forEach(destination => {
          processDestinationEstimates(destination, station, stationCoord, siriResponse);
        });
      } else if (station.etd) {
        // Handle case where etd is a single object instead of array
        processDestinationEstimates(station.etd, station, stationCoord, siriResponse);
      }
    });
  }
  
  return siriResponse;
}

// Process estimates for a destination and add to SIRI response
function processDestinationEstimates(destination, station, stationCoord, siriResponse) {
  if (!destination.estimate || !Array.isArray(destination.estimate)) {
    return;
  }
  
  destination.estimate.forEach((estimate, index) => {
    // Only include trains that are approaching soon (within 5 minutes)
    const minutes = parseInt(estimate.minutes, 10);
    if (isNaN(minutes) || minutes > 5) {
      return;
    }
    
    // Calculate a virtual position for the train based on its ETA
    // The closer to arrival, the closer to the station
    const factor = Math.max(0.1, minutes / 5); // At least 0.1 to avoid placing directly at station
    
    // Create a slight offset based on the direction and index to avoid overlapping trains
    const offset = 0.002 * (index + 1);
    const direction = estimate.direction === 'North' ? 1 : -1;
    
    const virtualPosition = {
      lat: parseFloat(stationCoord.lat) + (factor * 0.01 * direction) + (offset * (index % 2 ? 1 : -1)),
      lng: parseFloat(stationCoord.lng) + (factor * 0.01 * (index % 2 ? 1 : -1))
    };
    
    // Create a unique ID for this train based on its characteristics
    const vehicleId = `BART-${station.abbr}-${destination.abbreviation}-${estimate.color}-${index}`;
    
    // Add the virtual vehicle to the SIRI response
    siriResponse.Siri.ServiceDelivery.VehicleMonitoringDelivery[0].VehicleActivity.push({
      RecordedAtTime: new Date().toISOString(),
      MonitoredVehicleJourney: {
        LineRef: estimate.color || 'BART',
        DirectionRef: estimate.direction,
        VehicleRef: vehicleId,
        OperatorRef: 'BA',
        VehicleLocation: {
          Latitude: virtualPosition.lat,
          Longitude: virtualPosition.lng
        },
        Bearing: estimate.direction === 'North' ? 0 : 180,
        VehicleRef: vehicleId,
        DestinationName: destination.destination,
        DestinationRef: destination.abbreviation,
        MonitoredCall: {
          StopPointName: station.name,
          StopPointRef: station.abbr,
          ExpectedArrivalTime: getExpectedArrivalTime(minutes)
        }
      }
    });
  });
}

// Helper function to get expected arrival time
function getExpectedArrivalTime(minutesFromNow) {
  return new Date(Date.now() + (minutesFromNow * 60 * 1000)).toISOString();
}

// Helper function to get BART station coordinates
async function getBartStationCoordinates() {
  const response = await axios.get(`http://api.bart.gov/api/stn.aspx`, {
    params: {
      cmd: 'stns',
      key: BART_API_KEY,
      json: 'y'
    }
  });
  
  return response.data.root.stations.station;
}

// Start the server
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
