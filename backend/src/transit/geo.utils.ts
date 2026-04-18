import { Location } from './transit.types';

const EARTH_RADIUS_METERS = 6_371_000;

export function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters(from: Location, to: Location) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function buildCumulativeDistances(polyline: Location[]) {
  const cumulativeDistances = [0];

  for (let index = 1; index < polyline.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] +
        distanceInMeters(polyline[index - 1], polyline[index]),
    );
  }

  return cumulativeDistances;
}

export function clampLoopDistance(distance: number, routeLength: number) {
  if (routeLength <= 0) {
    return 0;
  }

  const normalized = distance % routeLength;
  return normalized >= 0 ? normalized : normalized + routeLength;
}

export function interpolateOnPolyline(
  polyline: Location[],
  cumulativeDistances: number[],
  distanceMeters: number,
) {
  if (polyline.length === 0) {
    return { lat: 0, lng: 0 };
  }

  if (polyline.length === 1) {
    return polyline[0];
  }

  const routeLength = cumulativeDistances[cumulativeDistances.length - 1];
  const targetDistance = clampLoopDistance(distanceMeters, routeLength);

  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    if (targetDistance <= cumulativeDistances[index]) {
      const previousDistance = cumulativeDistances[index - 1];
      const segmentDistance = cumulativeDistances[index] - previousDistance;

      if (segmentDistance === 0) {
        return polyline[index];
      }

      const ratio = (targetDistance - previousDistance) / segmentDistance;
      const start = polyline[index - 1];
      const end = polyline[index];

      return {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio,
      };
    }
  }

  return polyline[polyline.length - 1];
}

export function findSegmentIndex(
  cumulativeDistances: number[],
  distanceMeters: number,
) {
  if (cumulativeDistances.length <= 1) {
    return 0;
  }

  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    if (distanceMeters <= cumulativeDistances[index]) {
      return index - 1;
    }
  }

  return cumulativeDistances.length - 2;
}

export function remainingDistance(
  currentDistance: number,
  targetDistance: number,
  routeLength: number,
) {
  if (routeLength <= 0) {
    return 0;
  }

  if (targetDistance >= currentDistance) {
    return targetDistance - currentDistance;
  }

  return routeLength - currentDistance + targetDistance;
}

export function distanceAlongPolylineForPoint(
  polyline: Location[],
  cumulativeDistances: number[],
  point: Location,
) {
  if (polyline.length === 0 || cumulativeDistances.length === 0) {
    return 0;
  }

  if (polyline.length === 1) {
    return cumulativeDistances[0] ?? 0;
  }

  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestAlongDistance = 0;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const segmentLengthSquared = dx * dx + dy * dy;

    if (segmentLengthSquared === 0) {
      continue;
    }

    const projection = Math.max(
      0,
      Math.min(
        1,
        ((point.lng - start.lng) * dx + (point.lat - start.lat) * dy) /
          segmentLengthSquared,
      ),
    );
    const snappedPoint = {
      lat: start.lat + (end.lat - start.lat) * projection,
      lng: start.lng + (end.lng - start.lng) * projection,
    };
    const snappedDistance = distanceInMeters(point, snappedPoint);

    if (snappedDistance < nearestDistance) {
      nearestDistance = snappedDistance;
      const segmentDistance =
        (cumulativeDistances[index + 1] ?? cumulativeDistances[index] ?? 0) -
        (cumulativeDistances[index] ?? 0);
      nearestAlongDistance =
        (cumulativeDistances[index] ?? 0) + segmentDistance * projection;
    }
  }

  return nearestAlongDistance;
}

export function minutesFromDistance(distanceMeters: number, speedKmh: number) {
  if (speedKmh <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const metersPerSecond = (speedKmh * 1000) / 3600;
  return Math.ceil(distanceMeters / metersPerSecond / 60);
}
