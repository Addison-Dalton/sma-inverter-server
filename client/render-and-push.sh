#!/bin/bash

# render app and push to tidbyt
pixlet render /live-solar/app/live-solar.star --output /tmp/live-solar.webp
pixlet push $TIDBYT_DEVICE_ID /tmp/live-solar.webp