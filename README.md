# sma-inverter-server

This is a simple, and crappy, express server to expose data from my SMA inverters. It accomplishes this by communicating directly with the inverters on my local network.

## Setup

1. Install the dependencies
2. Copy the `.env.sample`, and rename is to `.env`. (See [Configuration](#configuration))

## Configuration

The sample env includes comments to better explain what each is for. That being said, some deserver additional explaination:

- **Inverter IPs**: Fairly straightforward, corresponds to the IP address for each inverter.
- **Watt generation data key**: The various data values that can be returned from the `getValues.json` endpoint have corresponding "keys". This key appears to match with the HTML element id that represents it. That's how I found the current watt generation data key.
- **Inverter Data Ids**: The returned JSON response from `getValues.json` has a unique key (to each inverter) as part of the object.

## SMA Communication

To make calls to the inverter's `getValues.json`, you need an `sid`. If an `sid` has not be set, it will first call the `login.json` to attain one, then it will request `getValues.json` to attain the current watt generation.

Secondally, the sid will eventually become stale. The `getValues.json` will return a {"err": 401} JSON response (Why it doesn't just return a proper status code, I can't say). When this occurs, an attempt will be made to attain another `sid`.

There's a limit on how many failed calls can be made. If that limit is hit, the server will need to be restarted.

## Endpoints

- `/data/live` - returns the current watt generation by both inverters.

  ```json
  { "watts": 0 }
  ```
