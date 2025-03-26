// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// 511.org API key
const API_KEY = '825a0905-cdd2-4179-b699-f5f46b26528e';

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

// Proxy endpoint for vehicle monitoring
app.get('/api/vehiclemonitoring/:agency', async (req, res) => {
  try {
    const { agency } = req.params;
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

// Start the server
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});