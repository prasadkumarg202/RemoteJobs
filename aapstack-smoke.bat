@echo off
cd /d "%~dp0"
echo Mana Kosamu - checking the AapStack deployment...
call node scripts\aapstack\smoke.mjs --jobicy --force > aapstack-smoke.log 2>&1
echo === EXIT %errorlevel% === >> aapstack-smoke.log
