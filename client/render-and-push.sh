#!/bin/bash

# render app and push to tidbyt
pixlet render /live-solar/app/live-solar.star
pixlet push $TIDBYT_DEVICE_ID /live-solar/app/live-solar.webp