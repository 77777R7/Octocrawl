#!/bin/bash
# Arm N of the M4.2 daily runs (docs/enhanced-access-tasks.md): Chrome for Testing with its field-trial testing config
# off. The installed_chrome launcher passes only egress flags through from its caller, so the flag is added here.
exec "${EXIT_SPLIT_CFT:?the Chrome for Testing binary}" --disable-field-trial-config "$@"
