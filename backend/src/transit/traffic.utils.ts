import {
  DirectionId,
  StopZone,
  TrafficLevel,
  TrafficPeriod,
} from './transit.types';

const BANGKOK_TIMEZONE = 'Asia/Bangkok';

function getBangkokHoursAndMinutes(timestampMs: number) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BANGKOK_TIMEZONE,
  });

  const parts = formatter.formatToParts(new Date(timestampMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value ?? '0',
  );

  return { hour, minute };
}

export function getBangkokMinutesOfDay(timestampMs: number) {
  const { hour, minute } = getBangkokHoursAndMinutes(timestampMs);
  return hour * 60 + minute;
}

export function getTrafficPeriod(timestampMs: number): TrafficPeriod {
  const minutes = getBangkokMinutesOfDay(timestampMs);

  if (minutes >= 300 && minutes < 390) {
    return 'early_morning';
  }

  if (minutes >= 390 && minutes < 570) {
    return 'morning_peak';
  }

  if (minutes >= 570 && minutes < 990) {
    return 'midday';
  }

  if (minutes >= 990 && minutes < 1170) {
    return 'evening_peak';
  }

  if (minutes >= 1170 && minutes < 1320) {
    return 'late_evening';
  }

  return 'night';
}

export function getBaseTrafficMultiplier(period: TrafficPeriod) {
  switch (period) {
    case 'morning_peak':
      return 0.9;
    case 'midday':
      return 1.02;
    case 'evening_peak':
      return 0.88;
    case 'late_evening':
      return 1.08;
    case 'night':
      return 1.18;
    case 'early_morning':
    default:
      return 1.06;
  }
}

export function getZoneTrafficMultiplier(
  zone: StopZone,
  period: TrafficPeriod,
) {
  if (period === 'night') {
    return 1.08;
  }

  if (period === 'late_evening') {
    return zone === 'cbd' || zone === 'river_crossing' ? 0.96 : 1.02;
  }

  switch (zone) {
    case 'cbd':
      return period === 'midday' ? 0.96 : 0.9;
    case 'interchange':
      return period === 'midday' ? 0.97 : 0.91;
    case 'river_crossing':
      return period === 'midday' ? 0.95 : 0.88;
    case 'arterial':
      return period === 'midday' ? 1 : 0.95;
    case 'suburban':
    default:
      return period === 'midday' ? 1.04 : 0.99;
  }
}

export function getTrafficLevel(multiplier: number): TrafficLevel {
  if (multiplier >= 1) {
    return 'light';
  }

  if (multiplier >= 0.86) {
    return 'moderate';
  }

  if (multiplier >= 0.72) {
    return 'heavy';
  }

  return 'severe';
}

export function getTrafficSpeedFloorKmh(
  baseSpeedKmh: number,
  trafficLevel: TrafficLevel,
) {
  switch (trafficLevel) {
    case 'light':
      return Math.max(baseSpeedKmh * 0.96, 38);
    case 'moderate':
      return Math.max(baseSpeedKmh * 0.88, 32);
    case 'heavy':
      return Math.max(baseSpeedKmh * 0.8, 27);
    case 'severe':
    default:
      return Math.max(baseSpeedKmh * 0.7, 22);
  }
}

export function getDirectionalDemandBoost(
  period: TrafficPeriod,
  direction: DirectionId,
  morningPeakFlow: DirectionId | 'balanced',
  eveningPeakFlow: DirectionId | 'balanced',
) {
  if (period === 'morning_peak') {
    if (morningPeakFlow === 'balanced') {
      return 0.4;
    }

    return morningPeakFlow === direction ? 1.2 : 0.15;
  }

  if (period === 'evening_peak') {
    if (eveningPeakFlow === 'balanced') {
      return 0.4;
    }

    return eveningPeakFlow === direction ? 1.2 : 0.2;
  }

  if (period === 'midday') {
    return 0.55;
  }

  if (period === 'late_evening') {
    return 0.25;
  }

  if (period === 'night') {
    return 0.1;
  }

  return 0.3;
}
