@echo off
REM ============================================================
REM NDADA Load Testing Runner — Windows
REM ============================================================
REM
REM Usage:
REM   run-tests.bat [scenario] [tier]
REM
REM Scenarios:
REM   normal       — Normal traffic distribution
REM   burst        — Burst/spike traffic
REM   login-storm  — Mass login event
REM   payment      — Payment deadline spike
REM   cert-gen     — Certificate generation spike
REM   stress       — Full combined stress test
REM   all          — Run all scenarios sequentially
REM
REM Tiers:
REM   smoke   — 5 VUs (sanity check)
REM   light   — 50 VUs
REM   medium  — 100 VUs
REM   heavy   — 250 VUs
REM   stress  — 500 VUs
REM
REM Example:
REM   run-tests.bat normal light
REM   run-tests.bat stress heavy
REM   run-tests.bat all medium
REM

SET SCENARIO=%1
SET TIER=%2

IF "%SCENARIO%"=="" SET SCENARIO=normal
IF "%TIER%"=="" SET TIER=light

SET RESULTS_DIR=results\%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%
SET RESULTS_DIR=%RESULTS_DIR: =0%
mkdir %RESULTS_DIR% 2>NUL

echo.
echo ================================================================
echo   NDADA Load Testing Suite
echo   Scenario: %SCENARIO%
echo   Tier:     %TIER%
echo   Results:  %RESULTS_DIR%
echo ================================================================
echo.

IF "%SCENARIO%"=="all" (
    echo Running ALL scenarios at tier: %TIER%
    echo.

    echo [1/6] Normal Traffic...
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\normal.json scenarios\normal-traffic.js
    echo.

    echo [2/6] Burst Traffic...
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\burst.json scenarios\burst-traffic.js
    echo.

    echo [3/6] Login Storm...
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\login-storm.json scenarios\login-storm.js
    echo.

    echo [4/6] Payment Spike...
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\payment.json scenarios\payment-spike.js
    echo.

    echo [5/6] Certificate Generation Spike...
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\cert-gen.json scenarios\cert-gen-spike.js
    echo.

    echo [6/6] Full Stress Test...
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\stress.json scenarios\full-stress.js
    echo.

    echo ================================================================
    echo   ALL SCENARIOS COMPLETE — Results in %RESULTS_DIR%
    echo ================================================================
    GOTO :END
)

IF "%SCENARIO%"=="normal" (
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\normal.json scenarios\normal-traffic.js
    GOTO :END
)

IF "%SCENARIO%"=="burst" (
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\burst.json scenarios\burst-traffic.js
    GOTO :END
)

IF "%SCENARIO%"=="login-storm" (
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\login-storm.json scenarios\login-storm.js
    GOTO :END
)

IF "%SCENARIO%"=="payment" (
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\payment.json scenarios\payment-spike.js
    GOTO :END
)

IF "%SCENARIO%"=="cert-gen" (
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\cert-gen.json scenarios\cert-gen-spike.js
    GOTO :END
)

IF "%SCENARIO%"=="stress" (
    k6 run --env TIER=%TIER% --out json=%RESULTS_DIR%\stress.json scenarios\full-stress.js
    GOTO :END
)

echo Unknown scenario: %SCENARIO%
echo Valid: normal, burst, login-storm, payment, cert-gen, stress, all

:END
