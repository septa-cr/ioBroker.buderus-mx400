![Logo](admin/buderus-mx400.png)

# ioBroker.buderus-mx400

![Test and Release](https://github.com/septa-cr/ioBroker.buderus-mx400/workflows/Test%20and%20Release/badge.svg)
[![License](https://img.shields.io/github/license/septa-cr/ioBroker.buderus-mx400)](LICENSE)
[![Donate](https://img.shields.io/badge/Donate-PayPal-ffc439.svg)](https://www.paypal.com/donate/?hosted_button_id=BW2WL8QCH2AMU)

**[🇩🇪 Deutsche Anleitung](docs/de/README.md)**

## Buderus MX400 adapter for ioBroker

This adapter reads the data of a **Buderus MX400** heat pump indoor unit via the official **local API** of the manufacturer. The connection runs directly in your home network. No cloud account is needed.

According to the manufacturer, the same API is also offered by the Bosch Connect-Key K 40 RF and the K 40 RF of IVT, Vulcano and Worcester. The adapter was developed and tested with a Buderus MX400.

> **Note:** The manufacturer's API is currently **read-only**. The adapter can display all values, but it cannot change settings of the heat pump.

## Features

- **Reads all available values automatically.** At startup, the adapter checks every resource described in the manufacturer's API specification and creates data points only for those your system actually provides. In addition, all signals reported by the device itself are read.
- **German and English names** for all data points, with the correct units (°C, kWh, %, l/h …)
- **Energy counters** (e.g. total consumption, heating, hot water) as separate data points for heat produced, compressor and electric heater
- **History data** for consumption, starts, working time and temperatures: daily values of the last 31 days, monthly values of the last 12 months, plus *today* and *this month*. Temperatures are shown as averages, energy values as totals.
- **Complex responses** such as error messages or system information are split into individual data points, and the complete response is also available as JSON.
- **Sensor special values** (short circuit, open circuit, flow too low …) are not shown as measured values, the data point stays empty instead.
- **Connection indicator** (`info.connection`) in the instance list
- **Gentle on the device:** values that rarely change (history data, Wi-Fi list) are only read once per hour. Resources that did not answer during startup are retried hourly.

## Requirements

- Buderus MX400 (or another supported K 40 RF gateway) with **gateway firmware 15.00.01 or newer**
- The indoor unit and ioBroker must be in the same local network.
- An **API token** for the device (see below)
- ioBroker with js-controller 6.0.11 or newer and Admin 7.0.23 or newer, Node.js 22 or newer recommended

## Creating the API token

The token is created **once** with the `Login` and `Pass` values printed on the label of the indoor unit. The token does not expire, so store it safely and treat it like a password.

Short summary of the manufacturer's guide:

1. Find the IP address of the indoor unit in your router.
2. Remove all hyphens from the `Pass` value.
3. Press the **WLAN** and **Wireless** buttons on the unit at the same time for one second. The LEDs briefly flash blue.
4. **Within 5 minutes**, request the token (port 9442):

    ```bash
    curl --insecure --request POST "https://IP-ADDRESS:9442/auth/token" \
      --header "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "grant_type=password" \
      --data-urlencode "username=LOGIN" \
      --data-urlencode "password=PASS-WITHOUT-HYPHENS" \
      --data-urlencode "client_name=iobroker"
    ```

    On Windows (PowerShell), write `curl.exe` instead of `curl` and put the command on a single line without the `\`.

5. Copy the value of `access_token` from the response.

The complete guide with troubleshooting: [K 40 RF API documentation (Bosch Home Comfort)](https://github.com/bosch-home-comfort/api-docs/blob/main/docs/k-40-rf.md)

## Installation

As long as the adapter is not available in the official ioBroker repository, install it directly from GitHub:

1. In the ioBroker Admin, open **Adapters**.
2. Click the **GitHub icon** ("Install from custom URL") in the toolbar.
3. On the **Custom** tab, enter `https://github.com/septa-cr/ioBroker.buderus-mx400` and confirm.
4. Create an instance of the adapter.

## Configuration

| Setting | Description |
| --- | --- |
| IP address of the indoor unit | IP address of the MX400 in your network, e.g. `192.168.178.135` |
| API token | The token created as described above. It is stored encrypted. |
| Polling interval (seconds) | How often the values are read. Default 60, minimum 10 |

At the first start, the adapter checks all resources of the API. This takes about one to two minutes. The log then shows how many resources your system provides, for example: *"Search completed: 1286 paths checked, 118 present …"*.

## Data points

| Folder | Content |
| --- | --- |
| `info.connection` | Connection to the indoor unit (true/false) |
| `signals.*` | All signals reported by the device, e.g. outdoor temperature, flow temperature, compressor speed |
| `heatSources.*` | Heat pump: temperatures, compressor power, system pressure, energy counters |
| `heatingCircuits.hc1.*` | Heating circuit 1: room temperature, setpoints, pump and status |
| `dhwCircuits.dhw1.*` | Hot water: temperature, setpoint, status |
| `devices.device1.*` | Paired radio devices, e.g. room controllers |
| `recordings.*` | History data (`daily`, `monthly`, `today`, `thisMonth`) |
| `system.*`, `gateway.*`, `notifications.*` | System information, gateway, error messages |

Which folders and values appear depends on your system.

## Security notes

- The indoor unit uses a self-signed certificate. As recommended by the manufacturer, the adapter therefore does not verify the certificate for this connection only. The data is still transmitted encrypted. Use the adapter only in a trusted local network.
- The token is stored encrypted in ioBroker and is only made available to the adapter itself.

## Support the development

Do you like this adapter? You can support its development with a coffee donation:

[![Donate via PayPal](https://img.shields.io/badge/Donate%20a%20coffee-PayPal-ffc439.svg?style=for-the-badge)](https://www.paypal.com/donate/?hosted_button_id=BW2WL8QCH2AMU)

## Disclaimer

This adapter is a private project and is not affiliated with Bosch Thermotechnik GmbH or Buderus. All product and company names are trademarks of their respective owners. Use at your own risk.

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### 0.0.1 (2026-10-18)

- (septa-cr) Initial release: reads all values of the indoor unit via the local API (signals, energy counters, history data), German and English data point names, connection indicator

## License

MIT License

Copyright (c) 2026 septa-cr <98657393+septa-cr@users.noreply.github.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
