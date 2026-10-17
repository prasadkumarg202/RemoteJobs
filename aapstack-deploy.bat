@echo off
cd /d "%~dp0"
echo Mana Kosamu - deploying to AapStack. This window closes by itself when finished.
echo === npm install === > aapstack-deploy.log
call npm install >> aapstack-deploy.log 2>&1
echo === dry run === >> aapstack-deploy.log
call npm run aapstack:deploy -- --dry-run >> aapstack-deploy.log 2>&1
if errorlevel 1 goto failed
echo === deploy === >> aapstack-deploy.log
call npm run aapstack:deploy >> aapstack-deploy.log 2>&1
if errorlevel 1 goto failed
echo === FINISHED OK === >> aapstack-deploy.log
exit /b 0
:failed
echo === FAILED === >> aapstack-deploy.log
exit /b 1
