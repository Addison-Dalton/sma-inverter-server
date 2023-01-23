# sma-inverter-server
This project includes an express server and client pixlet app. Combined, these provide live watt generation from my solar inverters. Please see the README in the server and client directories for more information on each.

This is only intended to run on my local network, as the server must call the inverters directly. That being said, should anyone else be interested, there's the possibility it can be configured to run on another network with a similar setup.

## Configuration
1. Copy the `.env.sample` file and rename it to `.env`. Fill in the empty variables present.
2. Within the `server` directory, copy the `.env.sample` file and rename it to `env.local`. Fill in the empty variables present. The README for the server provides additional configuration information.

## Running
Once all the `.env` files are set, you should only have to run `docker compose up`.

## Docker setup
The docker container has two images. One for the express server, and the other for the pixlet app. It first setups the express server, and then the client. The client is configured to handle a cron job to "render and push" the pixlet app to a tidbyt every 30 seconds.

## Credits
Below are some resources which aided in the creation of this project:
- [Pixlet docs](https://github.com/tidbyt/pixlet): Referenced often on how to build the pixlet app.
- [Cron + Docker = The Easiest Job Scheduler You’ll Ever Create](https://levelup.gitconnected.com/cron-docker-the-easiest-job-scheduler-youll-ever-create-e1753eb5ea44): Great article on using cron and docker together.
- [Pixlet-docker](https://github.com/eyeats/pixlet-docker): Borrowed code on how to setup a docker env to run pixlet commands in.