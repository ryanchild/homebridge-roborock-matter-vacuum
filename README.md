# Homebridge Roborock Matter Vacuum

Homebridge 2.0 platform plugin that exposes Roborock cloud vacuums as Matter `RoboticVacuumCleaner` devices.

This plugin uses the Roborock cloud account login. It does not require a miIO token, a local vacuum IP address, or LAN discovery.

## Requirements

- Homebridge 2.0 or newer
- Node.js 22 or newer
- Matter enabled for the bridge or child bridge running this plugin
- Roborock account with at least one supported vacuum
- A Matter controller, such as Apple Home, that supports Matter robotic vacuum cleaners

## Installation

### Homebridge UI

After the plugin is published to npm, install it from the Homebridge UI:

1. Open Homebridge.
2. Go to **Plugins**.
3. Search for `homebridge-roborock-matter-vacuum`.
4. Install the plugin.
5. Configure your Roborock account settings.
6. Restart Homebridge.

### npm

After publication:

```sh
npm install -g homebridge-roborock-matter-vacuum
```

For a beta tarball build:

```sh
npm install -g ./homebridge-roborock-matter-vacuum-0.3.1.tgz
```

If the tarball is hosted from another machine:

```sh
npm install -g http://HOST:PORT/homebridge-roborock-matter-vacuum-0.3.1.tgz
```

Restart Homebridge after installing or updating the plugin.

## Configuration

The simplest setup only needs your Roborock cloud account:

```json
{
  "platform": "RoborockMatter",
  "name": "Roborock Matter",
  "username": "you@example.com",
  "password": "your-roborock-password",
  "region": "us",
  "pollingIntervalSeconds": 20
}
```

Supported regions are:

- `us`: United States
- `eu`: Europe
- `cn`: China
- `sg`: Singapore / other regions

### Password And 2FA

Homebridge stores plugin configuration on disk. For a safer setup:

1. Add `username`, `password`, and `region`.
2. Restart Homebridge.
3. Wait for the plugin to log in and discover your vacuum.
4. Remove `password` from the plugin config.
5. Restart Homebridge again.

The plugin stores the Roborock login session on disk, so normal restarts should continue using the cached session without keeping the password in config.

If Roborock requires email verification, the logs will say so. Add the one-time `verificationCode`, restart Homebridge, then remove `verificationCode` after login succeeds.

## Automatic Discovery

Vacuums, clean modes, mop modes, and rooms are discovered automatically from the Roborock cloud where possible. The Homebridge Config UI intentionally keeps advanced overrides hidden for the beta so normal setup stays simple.

If your vacuum needs a model-specific fix, open an issue with sanitized logs instead of guessing custom clean-mode or room settings.

## Matter Pairing

This plugin publishes the vacuum as a Matter accessory. It is paired separately from the normal Homebridge HomeKit bridge.

1. Confirm Matter is enabled for the Homebridge bridge or child bridge running this plugin.
2. Restart Homebridge.
3. Open the Homebridge logs.
4. Look for `Commissioning codes for <vacuum name>`.
5. In Apple Home, choose **Add Accessory**.
6. If the accessory appears nearby, select it. It may initially appear as a generic Matter accessory.
7. If it does not appear, choose the manual-code option and enter the manual pairing code from the Homebridge log.

The Homebridge Accessories page is not the source of truth for Matter pairing. Use the Matter commissioning QR code or manual code printed in the logs.

If pairing gets stuck after repeated attempts, remove the failed Matter accessory from Apple Home and iOS Settings, restart Homebridge, and try again. In stubborn beta-test cases, clearing the Homebridge Matter accessory cache may be required.

## Matter Behavior

The plugin publishes Matter clusters for:

- `RvcRunMode`: idle and clean
- `RvcCleanMode`: vacuum and mop modes
- `RvcOperationalState`: stopped, running, paused, seeking charger, charging, docked
- `PowerSource`: battery percentage and charging state
- `Identify`: play the vacuum locate sound when supported
- `ServiceArea`: optional room or zone selection

Apple Home currently exposes controls such as start, pause, return to dock, battery, clean mode, mop mode, room selection, and identify depending on controller support and the vacuum model.

## Caveats

- This is an early beta and depends on Homebridge 2.0 Matter support.
- Cloud mode is currently the only supported connection mode.
- Local miIO IP/token control was intentionally removed from the public beta path to avoid shipping old vulnerable dependencies.
- Matter robotic vacuum support varies by controller. Apple Home, Google Home, Alexa, and SmartThings may expose different controls.
- Room discovery uses the current Roborock map. Multi-floor room publishing is not implemented yet.
- Roborock command acknowledgements can be slow or missing. The plugin returns quickly to Matter for responsiveness and logs late failures when Roborock reports them.
- Changing supported Matter modes or rooms may require restarting Homebridge and, in some cases, removing and re-adding the Matter accessory.
- Do not share Homebridge config files in issues or chat. Logs are safer than config, but they can still reveal device names and room counts.

## Development

```sh
npm install
npm run lint
npm run build
npm pack
```
