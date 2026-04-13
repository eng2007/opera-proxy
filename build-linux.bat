@echo on
setlocal

set "GOEXE=C:\Program Files\Go\bin\go.exe"
if not exist "%GOEXE%" set "GOEXE=go"

if not exist "bin" mkdir "bin"

set CGO_ENABLED=0
set GOOS=linux
set GOARCH=amd64

"%GOEXE%" build -a -tags netgo -trimpath -asmflags=-trimpath -ldflags="-s -w -extldflags ""-static""" -o "bin\opera-proxy.linux-x64"
if errorlevel 1 (
  echo.
  echo Build failed.
  exit /b 1
)

echo.
echo Build complete: bin\opera-proxy.linux-x64
endlocal
