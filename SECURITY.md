# Security policy

## Supported version

Security fixes are applied to the current production deployment and the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for this repository and include reproduction steps, affected routes, and any proof of impact. Do not access other users' data or perform denial-of-service testing.

You should receive an acknowledgement within seven days. Confirmed issues will be prioritized by severity, fixed in a private branch, and disclosed after a patched deployment is available.

SquadPilot has no login or database. Its public API accepts only an optional numeric FPL Team ID and does not store Team ID responses in shared Vercel Runtime Cache.
