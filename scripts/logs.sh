#!/usr/bin/env bash
journalctl --user -u diet-app.service -e -n 100 --no-pager
