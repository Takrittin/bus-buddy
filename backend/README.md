# BusBuddy Backend

Bangkok-style mock transit backend for BusBuddy, built with NestJS and Socket.IO.

The backend is designed to feel closer to a real Thai bus tracking app than generic demo data:

- Bangkok route numbers, terminals, and interchange areas
- Ordered stop patterns for outbound and inbound directions
- In-memory GTFS-like seed data that can later be swapped for real feeds
- Live bus movement with dwell time, layovers, occupancy, traffic, and ETA changes
- REST endpoints for routes, stops, nearby stops, live buses, route vehicles, and ETAs
- Socket.IO events for vehicle updates, ETA updates, and route status updates

## Folder Structure

```text
backend/
  src/
    app.module.ts
    main.ts
    buses/
      buses.controller.ts
      buses.module.ts
      buses.service.ts
      route-vehicles.controller.ts
    eta/
      dto/eta-query.dto.ts
      eta.controller.ts
      eta.module.ts
      eta.service.ts
    routes/
      routes.controller.ts
      routes.module.ts
      routes.service.ts
    simulation/
      simulation.gateway.ts
      simulation.module.ts
      simulation.service.ts
    stops/
      dto/nearby-stops.dto.ts
      nearby-stops.controller.ts
      stops.controller.ts
      stops.module.ts
      stops.service.ts
    transit/
      bangkok-transit.data.ts
      geo.utils.ts
      traffic.utils.ts
      transit.module.ts
      transit-state.service.ts
      transit.types.ts
```

## Mock Data Schema

The seed model is GTFS-inspired and split between static network data and live runtime state.

### Static Route Seed

```ts
interface RouteSeed {
  routeId: string;
  routeNumber: string;
  routeName: string;
  origin: string;
  destination: string;
  outboundDirection: string;
  inboundDirection: string;
  firstBusTime: string;
  lastBusTime: string;
  averageHeadwayMinutes: number;
  baseCruiseSpeedKmh: number;
  morningPeakFlow: 'outbound' | 'inbound' | 'balanced';
  eveningPeakFlow: 'outbound' | 'inbound' | 'balanced';
  directions: {
    outbound: RouteDirectionSeed;
    inbound: RouteDirectionSeed;
  };
}
```

### Static Stop Seed

```ts
interface StopSeed {
  stopId: string;
  stopName: string;
  location: { lat: number; lng: number };
  landmark: string;
  areaDescription: string;
  isMajorStop: boolean;
  isInterchange: boolean;
  zone: 'suburban' | 'arterial' | 'cbd' | 'interchange' | 'river_crossing';
}
```

### Live Bus State

```ts
interface BusState {
  busId: string;
  vehicleNumber: string;
  routeId: string;
  routeNumber: string;
  direction: 'outbound' | 'inbound';
  distanceAlongRouteMeters: number;
  currentPosition: { lat: number; lng: number };
  currentSegmentIndex: number;
  nextStopId: string;
  occupancyLevel: 'low' | 'medium' | 'high' | 'full';
  speedKmh: number;
  status: 'running' | 'delayed' | 'near_stop' | 'at_stop' | 'out_of_service';
  trafficMultiplier: number;
}
```

## Seeded Bangkok Routes

The current mock dataset includes:

- Route `29`: `Mo Chit - Hua Lamphong`
- Route `511`: `Pinklao - On Nut`
- Route `8`: `Bang Kapi - Wongwian Yai`
- Route `77`: `Bang Sue - Ekkamai`

Major seeded stop areas include:

- Mo Chit Bus Terminal
- Chatuchak Park
- Victory Monument
- Siam
- Sam Yan
- Hua Lamphong
- Pinklao
- Rama 9
- Asok
- Ekkamai
- On Nut
- Bang Kapi
- Wongwian Yai
- Bang Sue Grand Station
- Lat Phrao

## Simulation Logic

The simulation engine runs continuously and updates every 2-5 seconds.

- Buses move along ordered route polylines, not random coordinates.
- Each route has separate outbound and inbound stop orders.
- Buses slow down as they approach stops.
- Dwell time is longer at major stops, interchanges, and during busy periods.
- Terminal layovers flip buses to the opposite direction after arrival.
- ETA is recalculated from live position, stop distance, speed, traffic multiplier, and dwell/layover time.
- Traffic changes with Bangkok-style time buckets:
  - heavier in morning peak
  - moderate midday
  - heavier in evening peak
  - faster late evening and night
- Random delay events can temporarily affect a route direction.
- Occupancy changes with route, direction, stop importance, and time of day.

## Run

```bash
cd backend
npm install
npm run start:dev
```

Server URL:

```text
http://localhost:3001
```

## REST Endpoints

- `GET /routes`
- `GET /routes/:routeId`
- `GET /stops`
- `GET /stops/:id`
- `GET /stops/nearby?lat=13.7457&lng=100.5347&radius=1200`
- `GET /nearby-stops?lat=13.7457&lng=100.5347&radius=1200`
- `GET /buses/live`
- `GET /buses/live/:routeId`
- `GET /route-vehicles/:routeId`
- `GET /eta?stopId=stop_siam`

## Socket.IO Events

Listen for:

- `bus_location_update`
- `eta_update`
- `route_status_update`

### Example `bus_location_update`

```json
{
  "bus_id": "route_511_outbound_04",
  "vehicle_number": "511-O04",
  "route_id": "route_511",
  "route_number": "511",
  "direction": "outbound",
  "lat": 13.7369,
  "lng": 100.5614,
  "next_stop": {
    "stop_id": "stop_asok",
    "name": "Asok"
  },
  "occupancy_level": "medium",
  "speed_kmh": 17.8,
  "status": "running",
  "traffic_level": "moderate",
  "eta": {
    "estimated_arrival_time": "2026-04-14T08:14:00.000Z",
    "minutes": 3
  },
  "updated_at": "2026-04-14T08:11:00.000Z"
}
```

### Example `route_status_update`

```json
{
  "route_id": "route_29",
  "route_number": "29",
  "direction": "outbound",
  "traffic_level": "heavy",
  "average_speed_kmh": 12.6,
  "average_delay_minutes": 6,
  "active_delay_reasons": [
    "Heavy traffic near Victory Monument"
  ],
  "updated_at": "2026-04-14T08:11:00.000Z"
}
```

## Sample JSON Responses

### `GET /routes/route_29`

```json
{
  "route_id": "route_29",
  "route_number": "29",
  "route_name": "Mo Chit - Hua Lamphong",
  "origin": "Mo Chit",
  "destination": "Hua Lamphong",
  "outbound_direction": "Mo Chit -> Hua Lamphong",
  "inbound_direction": "Hua Lamphong -> Mo Chit",
  "first_bus_time": "04:30",
  "last_bus_time": "22:30",
  "average_headway_minutes": 10
}
```

### `GET /stops/stop_siam`

```json
{
  "stop_id": "stop_siam",
  "stop_name": "Siam",
  "route_ids": ["route_29", "route_511", "route_8"],
  "landmark": "Siam BTS Interchange",
  "is_major_stop": true,
  "is_interchange": true,
  "route_assignments": [
    {
      "route_id": "route_29",
      "route_number": "29",
      "direction": "outbound",
      "sequence": 8
    }
  ]
}
```

### `GET /buses/live`

```json
{
  "bus_id": "route_29_outbound_01",
  "vehicle_number": "29-O01",
  "route_id": "route_29",
  "route_number": "29",
  "direction": "outbound",
  "current_position": {
    "lat": 13.8116,
    "lng": 100.5505
  },
  "next_stop_id": "stop_chatuchak_park",
  "next_stop_name": "Chatuchak Park",
  "occupancy_level": "low",
  "speed_kmh": 23.8,
  "status": "running"
}
```

### `GET /eta?stopId=stop_asok`

```json
{
  "stop_id": "stop_asok",
  "bus_id": "route_511_outbound_04",
  "route_id": "route_511",
  "route_number": "511",
  "direction": "outbound",
  "estimated_arrival_time": "2026-04-14T08:14:00.000Z",
  "minutes": 2,
  "traffic_level": "moderate"
}
```
