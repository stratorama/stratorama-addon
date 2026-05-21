#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -e

PAIRING_CODE=$(bashio::config 'pairing_code')
TUNNEL_URL=$(bashio::config 'tunnel_url')

bashio::log.info "Starting Stratorama agent"
bashio::log.info "  tunnel_url:    ${TUNNEL_URL}"
bashio::log.info "  pairing_code:  $([[ -n "${PAIRING_CODE}" ]] && echo 'set' || echo 'empty')"

# SUPERVISOR_TOKEN is injected automatically by HA when homeassistant_api: true.
export PAIRING_CODE TUNNEL_URL

exec node /app/dist/index.js
