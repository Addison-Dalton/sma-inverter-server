#!/bin/bash

# wait for server
sleep 10

if [ -z "$SCHEDULER_ENVIRONMENT" ]; then
   echo "SCHEDULER_ENVIRONMENT not set, assuming Development"
   SCHEDULER_ENVIRONMENT="Development"
fi

# Select the crontab file based on the environment
CRON_FILE="crontab.$SCHEDULER_ENVIRONMENT"

# Load the crontab file
echo "Loading crontab file: $CRON_FILE"
crontab $CRON_FILE

# Start cron
echo "Starting cron..."
crond -f
