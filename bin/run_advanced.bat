opera-proxy.windows-x64.exe -fetch-freeproxy-out advanced-name-proxies.txt

opera-proxy.windows-x64.exe  -bind-address 127.0.0.1:18085 -api-proxy-file advanced-name-proxies.txt -api-proxy-parallel 20

pause