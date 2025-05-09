document.addEventListener('DOMContentLoaded', function() {
    // API Key for 511.org
    const API_KEY = '825a0905-cdd2-4179-b699-f5f46b26528e';
    
    // DOM Elements
    const mapElement = document.getElementById('map');
    const sidebar = document.getElementById('sidebar');
    const togglePanel = document.getElementById('toggle-panel');
    const refreshBtn = document.getElementById('refresh-btn');
    const agencyList = document.getElementById('agency-list');
    const vehicleList = document.getElementById('vehicle-list');
    const agencyLegend = document.getElementById('agency-legend');
    const regionSelect = document.getElementById('region-select');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const lastUpdate = document.getElementById('last-update');
    const vehicleCount = document.getElementById('vehicle-count');
    const showStops = document.getElementById('show-stops');
    const showVehicles = document.getElementById('show-vehicles');
    const debug = document.getElementById('debug');
    
    // Initialize map
    const map = L.map('map', {
        center: [37.77, -122.42], // San Francisco by default
        zoom: 12,
        zoomControl: true,
        attributionControl: true
    });
    
    // Base map layer - CartoDB positron
    const baseMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
    
    // Create layers for vehicles and stops
    const vehicleLayer = L.layerGroup().addTo(map);
    const stopLayer = L.layerGroup().addTo(map);
    
    // Predefined region views for the Bay Area
    const regions = {
        'sf': { center: [37.77, -122.42], zoom: 13, bounds: [[37.70, -122.51], [37.84, -122.35]] },
        'east-bay': { center: [37.80, -122.25], zoom: 12, bounds: [[37.60, -122.35], [37.90, -122.10]] },
        'south-bay': { center: [37.35, -121.96], zoom: 11, bounds: [[37.20, -122.10], [37.45, -121.80]] },
        'peninsula': { center: [37.50, -122.25], zoom: 11, bounds: [[37.40, -122.50], [37.70, -122.10]] },
        'north-bay': { center: [38.00, -122.50], zoom: 11, bounds: [[37.85, -122.70], [38.15, -122.30]] },
        'all': { center: [37.80, -122.25], zoom: 10, bounds: [[37.10, -122.70], [38.20, -121.70]] }
    };
    
    // Define Bay Area transit agencies with their colors
    const agencyColors = {
        'BA': '#0099cc', // BART
        'SF': '#e61919', // SF Muni
        'AC': '#4db848', // AC Transit
        'CT': '#e6291f', // Caltrain
        'SM': '#cb3927', // SamTrans
        'GG': '#ff5f00', // Golden Gate Transit
        'SC': '#6699cc', // VTA
        'WC': '#3b5998', // WestCAT
        'CC': '#faa61a', // County Connection
        'FS': '#347235', // FAST
        'ST': '#3ab54a', // SolTrans
        'MA': '#0f6bad', // Marin Transit
        'GF': '#ff9900', // Golden Gate Ferry
        'SB': '#1c66b7', // SF Bay Ferry
        'SR': '#aa4199', // Santa Rosa CityBus
        'VN': '#8c68a6', // Vine Transit/Napa
        'SA': '#009933', // SMART Train
        'DE': '#008080', // Tri Delta Transit
        'WH': '#6c4c1a'  // Wheels/LAVTA
    };
    
    // BART line colors
    const bartLineColors = {
        'RED': '#ff0000',      // Richmond–Millbrae+SFO
        'ORANGE': '#ff9933',   // Berryessa–Richmond
        'YELLOW': '#ffff33',   // Antioch–SFO/Millbrae
        'GREEN': '#339933',    // Berryessa–Daly City
        'BLUE': '#0099cc',     // Dublin/Pleasanton–Daly City
        'BEIGE': '#d5cfa3'     // Oakland Airport Connector
    };
    
    // State variables
    let agencies = [];
    let vehicles = [];
    let stops = [];
    let activeAgencies = new Set();
    
    // UI event handlers
    
    // Toggle sidebar visibility
    togglePanel.addEventListener('click', function() {
        sidebar.classList.toggle('hidden');
    });
    
    // Region selection
    regionSelect.addEventListener('change', function() {
        const region = regions[this.value] || regions.all;
        if (region.bounds) {
            map.fitBounds(region.bounds);
        } else {
            map.setView(region.center, region.zoom);
        }
    });
    
    // Toggle stops/stations visibility
    showStops.addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(stopLayer);
            fetchStopsForActiveAgencies();
        } else {
            map.removeLayer(stopLayer);
        }
    });
    
    // Toggle vehicles visibility
    showVehicles.addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(vehicleLayer);
            fetchVehicles();
        } else {
            map.removeLayer(vehicleLayer);
        }
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', function() {
        refreshData();
    });
    
    // Helper functions
    
    // Create a marker icon for vehicles
    function createVehicleIcon(color) {
        return L.divIcon({
            className: 'vehicle-icon',
            html: `<div style="background-color: ${color}; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });
    }
    
    // Create a marker icon for stops/stations
    function createStopIcon() {
        return L.divIcon({
            className: 'stop-icon',
            html: `<div style="background-color: black; width: 6px; height: 6px; border-radius: 50%; border: 1px solid white;"></div>`,
            iconSize: [6, 6],
            iconAnchor: [3, 3]
        });
    }
    
    // Get a random color for agencies without defined colors
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
    
    // Fetch agencies from 511.org API
    async function fetchAgencies() {
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        
        try {
            // Use local proxy instead of direct API call
            const response = await fetch(`/api/operators`);
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            let data = await response.json();
            
            // Handle different response formats
            if (!Array.isArray(data)) {
                if (data.content && Array.isArray(data.content)) {
                    data = data.content;
                } else {
                    console.warn('Unexpected API response format:', data);
                    throw new Error('Unexpected API response format');
                }
            }
            
            // Process agencies data
            agencies = data.map(agency => ({
                id: agency.Id || agency.id,
                name: agency.Name || agency.name,
                color: agencyColors[agency.Id || agency.id] || getRandomColor(),
                monitored: agency.Monitored === 'true' || agency.Monitored === true
            })).filter(agency => {
                // Filter out non-transit agencies or internal IDs
                return agency.id !== '5E' && agency.id !== '5F' && agency.id !== '5O' && agency.id !== '5S';
            });
            
            // Sort agencies alphabetically
            agencies.sort((a, b) => a.name.localeCompare(b.name));
            
            // Initialize active agencies
            activeAgencies = new Set(agencies.map(a => a.id));
            
            // Update UI
            populateAgencyUI();
            
            // Fetch initial data
            fetchVehicles();
            if (showStops.checked) {
                fetchStopsForActiveAgencies();
            }
            
        } catch (error) {
            console.error('Error fetching agencies:', error);
            useFallbackAgencies();
        } finally {
            loading.style.display = 'none';
        }
    }
    
    // Use fallback agency data if API fails
    function useFallbackAgencies() {
        agencies = [
            { id: 'BA', name: 'BART', color: '#0099cc', monitored: true },
            { id: 'SF', name: 'SF Muni', color: '#e61919', monitored: true },
            { id: 'AC', name: 'AC Transit', color: '#4db848', monitored: true },
            { id: 'CT', name: 'Caltrain', color: '#e6291f', monitored: true },
            { id: 'SM', name: 'SamTrans', color: '#cb3927', monitored: true },
            { id: 'GG', name: 'Golden Gate Transit', color: '#ff5f00', monitored: true },
            { id: 'SC', name: 'VTA', color: '#6699cc', monitored: true }
        ];
        
        // Initialize active agencies
        activeAgencies = new Set(agencies.map(a => a.id));
        
        // Update UI
        populateAgencyUI();
        
        // Show error
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'Unable to fetch transit agencies. Using basic agency data.';
        
        // Fetch fallback data
        fetchVehicles();
    }
    
    // Populate agency UI elements (sidebar and legend)
    function populateAgencyUI() {
        // Clear existing content
        agencyList.innerHTML = '';
        agencyLegend.innerHTML = '';
        
        // Add agencies to sidebar list
        agencies.forEach(agency => {
            const li = document.createElement('li');
            li.className = 'agency-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `agency-${agency.id}`;
            checkbox.checked = activeAgencies.has(agency.id);
            checkbox.dataset.agency = agency.id;
            
            const color = document.createElement('span');
            color.className = 'agency-color';
            color.style.backgroundColor = agency.color;
            
            const label = document.createElement('label');
            label.htmlFor = `agency-${agency.id}`;
            label.textContent = agency.name;
            
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    activeAgencies.add(agency.id);
                    if (showStops.checked) {
                        fetchStops(agency.id);
                    }
                } else {
                    activeAgencies.delete(agency.id);
                }
                updateMap();
            });
            
            li.appendChild(checkbox);
            li.appendChild(color);
            li.appendChild(label);
            agencyList.appendChild(li);
            
            // Add to legend if active
            if (activeAgencies.has(agency.id)) {
                const legendItem = document.createElement('div');
                legendItem.className = 'legend-item';
                
                const legendColor = document.createElement('div');
                legendColor.className = 'legend-color';
                legendColor.style.backgroundColor = agency.color;
                
                const legendLabel = document.createElement('span');
                legendLabel.textContent = agency.name;
                
                legendItem.appendChild(legendColor);
                legendItem.appendChild(legendLabel);
                agencyLegend.appendChild(legendItem);
            }
        });
    }
    
    // Fetch vehicle positions from proxy server
    async function fetchVehicles() {
        if (!showVehicles.checked) return;
        
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        
        try {
            // Get a list of monitored agencies from our active agencies
            const monitoredAgencies = agencies
                .filter(a => a.monitored && activeAgencies.has(a.id))
                .slice(0, 5); // Limit to 5 agencies to avoid rate limiting
            
            if (monitoredAgencies.length === 0) {
                throw new Error('No monitored agencies selected');
            }
            
            // Start with an empty vehicles array
            vehicles = [];
            
            // Fetch vehicles for each monitored agency
            for (const agency of monitoredAgencies) {
                try {
                    console.log(`Fetching vehicles for ${agency.name} (${agency.id})`);
                    
                    // Using the proxy server endpoint
                    const response = await fetch(`/api/vehiclemonitoring/${agency.id}`);
                    
                    if (!response.ok) {
                        console.warn(`API error for ${agency.id}: ${response.status}`);
                        continue;
                    }
                    
                    const data = await response.json();
                    processAgencyVehicles(data, agency);
                } catch (agencyError) {
                    console.warn(`Error fetching vehicles for agency ${agency.id}:`, agencyError);
                }
            }
            
            // If we didn't get any vehicles, throw an error to trigger the fallback
            if (vehicles.length === 0) {
                throw new Error('No vehicles found from any agencies');
            }
            
            // Update UI
            updateVehicleMarkers();
            updateNearbyVehiclesList();
            
            // Update status
            const now = new Date();
            lastUpdate.textContent = `Last updated: ${now.toLocaleTimeString()}`;
            vehicleCount.textContent = `${vehicles.length} vehicles tracked`;
            
            // Hide loading and error if shown
            loading.style.display = 'none';
            errorMessage.style.display = 'none';
            
        } catch (error) {
            console.error('Error fetching vehicles:', error);
            useDemoVehicles();
        }
    }
    
    // Process vehicles from a specific agency
    function processAgencyVehicles(data, agency) {
        if (!data || !data.Siri || !data.Siri.ServiceDelivery || 
            !data.Siri.ServiceDelivery.VehicleMonitoringDelivery) {
            console.warn(`Invalid vehicle data format for agency ${agency.id}`);
            return;
        }
        
        // Handle different response formats
        let vehicleActivities;
        const delivery = data.Siri.ServiceDelivery.VehicleMonitoringDelivery;
        
        if (Array.isArray(delivery)) {
            if (!delivery[0] || !delivery[0].VehicleActivity) return;
            vehicleActivities = delivery[0].VehicleActivity;
        } else {
            if (!delivery.VehicleActivity) return;
            vehicleActivities = delivery.VehicleActivity;
        }
        
        // Handle both array and single object responses
        if (!Array.isArray(vehicleActivities)) {
            vehicleActivities = [vehicleActivities];
        }
        
        // Process each vehicle
        vehicleActivities.forEach(activity => {
            if (!activity.MonitoredVehicleJourney) return;
            
            const journey = activity.MonitoredVehicleJourney;
            
            // Skip vehicles without location data
            if (!journey.VehicleLocation || 
                !journey.VehicleLocation.Latitude || 
                !journey.VehicleLocation.Longitude) return;
            
            // Ensure latitude and longitude are valid numbers
            const lat = parseFloat(journey.VehicleLocation.Latitude);
            const lng = parseFloat(journey.VehicleLocation.Longitude);
            
            if (isNaN(lat) || isNaN(lng)) return;
            
            // Check if latitude and longitude are in reasonable bounds for Bay Area
            if (lat < 36.5 || lat > 38.5 || lng < -123.0 || lng > -121.0) return;
            
            // For BART, use the appropriate line color
            let vehicleColor = agency.color;
            if (agency.id === 'BA' && journey.LineRef && bartLineColors[journey.LineRef]) {
                vehicleColor = bartLineColors[journey.LineRef];
            }
            
            const vehicle = {
                id: journey.VehicleRef || `${agency.id}-${Math.random().toString(36).substring(2, 9)}`,
                agency: agency.id,
                agencyName: agency.name,
                color: vehicleColor,
                position: {
                    lat: lat,
                    lng: lng
                },
                bearing: journey.Bearing || 0,
                route: journey.LineRef || 'Unknown',
                destination: journey.DestinationName || 'Unknown',
                timestamp: activity.RecordedAtTime,
                // Additional fields for BART
                expectedArrival: journey.MonitoredCall ? journey.MonitoredCall.ExpectedArrivalTime : null,
                nextStop: journey.MonitoredCall ? journey.MonitoredCall.StopPointName : null
            };
            
            vehicles.push(vehicle);
        });
        
        console.log(`Added ${vehicleActivities.length} vehicles from ${agency.name}`);
    }
    
    // Use demo vehicles data if API fails
    function useDemoVehicles() {
        // Clear existing vehicles
        vehicles = [];
        
        // Show loading while generating demo data
        loading.style.display = 'block';
        
        // Define regions for agencies to ensure proper positioning
        const agencyRegions = {
            'SF': { // SF Muni
                center: [37.77, -122.42],
                radius: 0.05
            },
            'BA': { // BART
                lines: [
                    // Yellow line (Antioch-SFO)
                    [[37.70, -122.40], [37.85, -122.30]], // SF to East Bay
                    // Red line (Richmond-Millbrae)
                    [[37.93, -122.35], [37.60, -122.38]], // Richmond to Millbrae
                    // Orange line (Richmond-Berryessa)
                    [[37.93, -122.35], [37.37, -121.87]], // Richmond to Berryessa
                    // Green line (Berryessa-Daly City)
                    [[37.37, -121.87], [37.70, -122.47]], // Berryessa to Daly City
                    // Blue line (Dublin-Daly City)
                    [[37.70, -122.47], [37.70, -121.90]]  // Daly City to Dublin
                ],
                lineColors: [
                    'YELLOW', 'RED', 'ORANGE', 'GREEN', 'BLUE'
                ]
            },
            'AC': { // AC Transit
                center: [37.80, -122.27],
                radius: 0.1
            },
            'SM': { // SamTrans
                center: [37.53, -122.30],
                radius: 0.1
            },
            'CT': { // Caltrain
                lines: [
                    [[37.78, -122.39], [37.31, -121.90]], // SF to San Jose
                ]
            },
            'GG': { // Golden Gate Transit
                center: [37.95, -122.50],
                radius: 0.1
            },
            'SC': { // VTA
                center: [37.35, -121.90],
                radius: 0.1
            }
        };
        
        // Generate vehicles for each active agency
        agencies.filter(agency => activeAgencies.has(agency.id)).forEach(agency => {
            const count = Math.floor(Math.random() * 10) + 5; // 5-15 vehicles per agency
            const region = agencyRegions[agency.id];
            
            if (!region) {
                // Default positioning for agencies without defined regions
                for (let i = 0; i < count; i++) {
                    const lat = 37.7 + Math.random() * 0.3; // Bay Area general area
                    const lng = -122.4 + Math.random() * 0.3;
                    
                    vehicles.push({
                        id: `${agency.id}-demo-${i}`,
                        agency: agency.id,
                        agencyName: agency.name,
                        color: agency.color,
                        position: { lat, lng },
                        bearing: Math.floor(Math.random() * 360),
                        route: `${Math.floor(Math.random() * 100)}`,
                        destination: ['Downtown', 'Airport', 'Transit Center'][Math.floor(Math.random() * 3)],
                        timestamp: new Date().toISOString()
                    });
                }
                return;
            }
            
            if (region.center && region.radius) {
                // Circular region agencies
                for (let i = 0; i < count; i++) {
                    // Random point within radius of center
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * region.radius;
                    const lat = region.center[0] + radius * Math.cos(angle);
                    const lng = region.center[1] + radius * Math.sin(angle);
                    
                    vehicles.push({
                        id: `${agency.id}-demo-${i}`,
                        agency: agency.id,
                        agencyName: agency.name,
                        color: agency.color,
                        position: { lat, lng },
                        bearing: Math.floor(Math.random() * 360),
                        route: `${Math.floor(Math.random() * 100)}`,
                        destination: ['Downtown', 'Airport', 'Transit Center'][Math.floor(Math.random() * 3)],
                        timestamp: new Date().toISOString()
                    });
                }
            } else if (region.lines) {
                // Line-based agencies like BART and Caltrain
                for (let i = 0; i < count; i++) {
                    // Pick a random line
                    const lineIndex = Math.floor(Math.random() * region.lines.length);
                    const line = region.lines[lineIndex];
                    // Random point along the line
                    const t = Math.random();
                    const lat = line[0][0] + t * (line[1][0] - line[0][0]);
                    const lng = line[0][1] + t * (line[1][1] - line[0][1]);
                    
                    // For BART, use the line colors
                    let color = agency.color;
                    let route = `${Math.floor(Math.random() * 100)}`;
                    
                    if (agency.id === 'BA' && region.lineColors) {
                        const lineColor = region.lineColors[lineIndex];
                        color = bartLineColors[lineColor] || agency.color;
                        route = lineColor;
                    }
                    
                    vehicles.push({
                        id: `${agency.id}-demo-${i}`,
                        agency: agency.id,
                        agencyName: agency.name,
                        color: color,
                        position: { lat, lng },
                        bearing: Math.floor(Math.random() * 360),
                        route: route,
                        destination: ['Downtown', 'Airport', 'Transit Center'][Math.floor(Math.random() * 3)],
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });
        
        // Update UI
        updateVehicleMarkers();
        updateNearbyVehiclesList();
        
        // Update status
        const now = new Date();
        lastUpdate.textContent = `Last updated: ${now.toLocaleTimeString()} (demo data)`;
        vehicleCount.textContent = `${vehicles.length} vehicles tracked (demo)`;
        
        // Show error and hide loading
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'Unable to fetch live vehicle data. Using demo data.';
        loading.style.display = 'none';
    }
    
    // Update vehicle markers on the map
    function updateVehicleMarkers() {
        // Clear existing markers
        vehicleLayer.clearLayers();
        
        // Add new markers for active agencies
        vehicles.filter(v => activeAgencies.has(v.agency)).forEach(vehicle => {
            const marker = L.marker([vehicle.position.lat, vehicle.position.lng], {
                icon: createVehicleIcon(vehicle.color),
                title: `${vehicle.agencyName} - ${vehicle.route}`
            });
            
            let popupContent = `
                <strong>${vehicle.agencyName}</strong><br>
                Route: ${vehicle.route}<br>
                To: ${vehicle.destination}
            `;
            
            // Add extra info for BART
            if (vehicle.agency === 'BA' && vehicle.nextStop) {
                popupContent += `<br>Next stop: ${vehicle.nextStop}`;
                if (vehicle.expectedArrival) {
                    const arrivalTime = new Date(vehicle.expectedArrival);
                    popupContent += `<br>Expected arrival: ${arrivalTime.toLocaleTimeString()}`;
                }
            }
            
            marker.bindPopup(popupContent);
            
            marker.on('click', function() {
                this.openPopup();
            });
            
            vehicleLayer.addLayer(marker);
        });
    }
    
    // Fetch stops for all active agencies
    function fetchStopsForActiveAgencies() {
        if (!showStops.checked) return;
        
        // Clear existing stops
        stops = [];
        stopLayer.clearLayers();
        
        // Fetch stops for each active agency
        for (const agencyId of activeAgencies) {
            fetchStops(agencyId);
        }
    }
    
    // Fetch stops for a specific agency from proxy server
    async function fetchStops(agencyId) {
        if (!showStops.checked) return;
        
        try {
            // Using the proxy server endpoint
            const response = await fetch(`/api/stops/${agencyId}`);
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Check for different data formats and handle accordingly
            if (data.Contents && data.Contents.dataObjects && data.Contents.dataObjects.ScheduledStopPoint) {
                // Handle NeTEx format
                const stopsData = Array.isArray(data.Contents.dataObjects.ScheduledStopPoint) 
                    ? data.Contents.dataObjects.ScheduledStopPoint 
                    : [data.Contents.dataObjects.ScheduledStopPoint];
                
                processNeTexStops(stopsData, agencyId);
            } else if (Array.isArray(data)) {
                // Handle GeoJSON format
                processStops(data, agencyId);
            } else {
                console.error('Unknown stops data format for agency:', agencyId, data);
            }
            
        } catch (error) {
            console.error(`Error fetching stops for agency ${agencyId}:`, error);
        }
    }
    
    // Process stops data from API (GeoJSON format)
    function processStops(data, agencyId) {
        // Find agency info
        const agency = agencies.find(a => a.id === agencyId) || {
            name: agencyId,
            color: agencyColors[agencyId] || '#999999'
        };
        
        // Process each stop
        data.forEach(stop => {
            if (!stop.geometry || !stop.geometry.coordinates || !stop.properties) return;
            
            // IMPORTANT: coordinates in GeoJSON are [longitude, latitude]
            const [longitude, latitude] = stop.geometry.coordinates;
            
            const stopObj = {
                id: stop.properties.id || `${agencyId}-stop-${Math.random().toString(36).substring(2, 9)}`,
                name: stop.properties.name || 'Unknown Stop',
                agency: agencyId,
                agencyName: agency.name,
                position: {
                    lat: latitude,
                    lng: longitude
                },
                lines: stop.properties.lines ? stop.properties.lines.map(l => l.id).join(', ') : ''
            };
            
            stops.push(stopObj);
            
            // Add stop marker to the map
            const marker = L.marker([stopObj.position.lat, stopObj.position.lng], {
                icon: createStopIcon(),
                title: stopObj.name
            });
            
            marker.bindPopup(`
                <strong>${stopObj.name}</strong><br>
                ${stopObj.agencyName}<br>
                ${stopObj.lines ? `Lines: ${stopObj.lines}` : ''}
            `);
            
            stopLayer.addLayer(marker);
        });
        
        console.log(`Added ${data.length} stops for ${agency.name}`);
    }
    
    // Process NeTEx format stops
    function processNeTexStops(stopsData, agencyId) {
        // Find agency info
        const agency = agencies.find(a => a.id === agencyId) || {
            name: agencyId,
            color: agencyColors[agencyId] || '#999999'
        };
        
        // Process each stop
        stopsData.forEach(stop => {
            if (!stop.Location || !stop.Location.Latitude || !stop.Location.Longitude || !stop.id) return;
            
            const stopObj = {
                id: stop.id,
                name: stop.Name || 'Unknown Stop',
                agency: agencyId,
                agencyName: agency.name,
                position: {
                    lat: parseFloat(stop.Location.Latitude),
                    lng: parseFloat(stop.Location.Longitude)
                },
                lines: ''
            };
            
            stops.push(stopObj);
            
            // Add stop marker to the map
            const marker = L.marker([stopObj.position.lat, stopObj.position.lng], {
                icon: createStopIcon(),
                title: stopObj.name
            });
            
            marker.bindPopup(`
                <strong>${stopObj.name}</strong><br>
                ${stopObj.agencyName}
            `);
            
            stopLayer.addLayer(marker);
        });
        
        console.log(`Added ${stopsData.length} stops for ${agency.name}`);
    }
    
    // Update nearby vehicles list
    function updateNearbyVehiclesList() {
        // Clear existing list
        vehicleList.innerHTML = '';
        
        // Get map center and bounds
        const center = map.getCenter();
        const bounds = map.getBounds();
        
        // Filter vehicles within the current map view
        const visibleVehicles = vehicles.filter(v => {
            return activeAgencies.has(v.agency) && 
                   bounds.contains([v.position.lat, v.position.lng]);
        });
        
        // Calculate distance to center and sort
        const nearbyVehicles = visibleVehicles.map(v => {
            const distance = map.distance(
                [v.position.lat, v.position.lng],
                [center.lat, center.lng]
            );
            return { ...v, distance };
        }).sort((a, b) => a.distance - b.distance).slice(0, 10);
        
        // Add to list
        nearbyVehicles.forEach(vehicle => {
            const item = document.createElement('li');
            item.className = 'vehicle-item';
            
            const color = document.createElement('span');
            color.className = 'agency-color';
            color.style.backgroundColor = vehicle.color;
            
            let itemContent = `
                ${color.outerHTML}
                <strong>${vehicle.agencyName}</strong><br>
                Route ${vehicle.route} to ${vehicle.destination}
            `;
            
            // Add extra info for BART
            if (vehicle.agency === 'BA' && vehicle.nextStop) {
                itemContent += `<br>Next: ${vehicle.nextStop}`;
            }
            
            item.innerHTML = itemContent;
            
            item.addEventListener('click', function() {
                // Pan to vehicle position
                map.setView([vehicle.position.lat, vehicle.position.lng], 16);
                
                // Find and open the popup for this vehicle
                vehicleLayer.eachLayer(layer => {
                    const pos = layer.getLatLng();
                    if (pos.lat === vehicle.position.lat && pos.lng === vehicle.position.lng) {
                        layer.openPopup();
                    }
                });
            });
            
            vehicleList.appendChild(item);
        });
        
        // Show message if no vehicles are nearby
        if (nearbyVehicles.length === 0) {
            const item = document.createElement('li');
            item.className = 'vehicle-item';
            item.textContent = 'No vehicles in current view';
            vehicleList.appendChild(item);
        }
    }
    
    // Update map with active filters
    function updateMap() {
        updateVehicleMarkers();
        updateNearbyVehiclesList();
    }
    
    // Refresh all data
    function refreshData() {
        if (showVehicles.checked) {
            fetchVehicles();
        }
        if (showStops.checked) {
            fetchStopsForActiveAgencies();
        }
    }
    
    // Set initial region view
    const defaultRegion = regions[regionSelect.value] || regions.sf;
    map.setView(defaultRegion.center, defaultRegion.zoom);
    
    // Map events
    map.on('moveend', updateNearbyVehiclesList);
    
    // Auto-refresh vehicles every 30 seconds
    setInterval(fetchVehicles, 30000);
    
    // Initial data load
    fetchAgencies();
});
