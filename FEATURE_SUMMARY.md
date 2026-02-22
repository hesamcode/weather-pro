# Feature Summary

## Core Experience

- Works as a static app when opening `index.html` directly
- Uses Open-Meteo APIs (no key required)
- Uses Chart.js via CDN for hourly graphing

## Search and Discovery

- City search form with autocomplete suggestions
- Suggestions fetched from Open-Meteo Geocoding API
- Keyboard navigation in autocomplete

## Weather Data

- Current weather (temperature, feels like, humidity, wind, precipitation, condition)
- 7-day forecast with high/low + condition + precipitation
- 24-hour hourly temperature chart

## Personalization

- Dark/light theme toggle
- Celsius/Fahrenheit unit toggle
- Favorites list with add/remove and quick-open
- Recent searches list with quick-open and remove

## Persistence

- Favorites and recent searches persist in `localStorage`
- Settings persist in `localStorage`
- Versioned storage schema (`version: 2`) with migration support

## UX and Quality

- Loading skeleton state while fetching
- Friendly error UI with retry button
- Toast notifications for key actions and failures
- Footer credit link and accessible About modal
- Responsive layout for mobile and desktop
- Accessibility support (skip link, labels, ARIA status/live regions, keyboard-friendly controls)
- Defensive error handling to avoid console errors from expected failure paths
