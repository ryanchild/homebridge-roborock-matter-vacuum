# Changelog

All notable changes to this project will be documented in this file.

## 0.3.2 - 2026-05-30

- Added npm/Homebridge display metadata, including `displayName`, `author`, and package `icon`.
- Expanded npm discovery keywords for Homebridge, Matter, HomeKit, Roborock, robot vacuums, and mop support.

## 0.3.1 - 2026-05-30

- Simplified the Homebridge Config UI to the core Roborock cloud setup fields.
- Kept advanced vacuum, clean-mode, and room overrides out of the visible beta configuration flow.
- Updated README install, config, Matter pairing, and caveat guidance.

## 0.3.0 - 2026-05-30

- Removed local miIO IP/token support from the public beta path.
- Removed the vulnerable `miio` dependency chain.
- Allowed cached Roborock cloud sessions to start without keeping the password in config.
- Masked the one-time email verification code in the Homebridge Config UI.
- Restricted custom Roborock API host overrides to known Roborock endpoints.
- Reduced default log exposure for room names and device identifiers.
- Added security notes for Roborock credentials and Matter pairing trust.

## 0.2.0 - 2026-05-30

- Added Matter robotic vacuum support for Roborock cloud-discovered vacuums.
- Added battery, clean mode, mop mode, room selection, docking, pause/resume, and identify support.
- Added Roborock room discovery from the active map.

## 0.1.0 - 2026-05-30

- Initial experimental Homebridge 2.0 Matter vacuum plugin prototype.
