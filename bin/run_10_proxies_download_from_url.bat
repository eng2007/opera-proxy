rem opera-proxy.windows-x64.exe -fetch-freeproxy-out advanced-name-proxies.txt

куь opera-proxy.windows-x64.exe  -bind-address 127.0.0.1:18085 -api-proxy-file 10proxies.txt -api-proxy-parallel 10

opera-proxy.windows-x64.exe  -bind-address 127.0.0.1:18085 -api-proxy-list-url https://proxy.webshare.io/api/v2/proxy/list/download/eyepmnvheuqbafapounxojzywplipobgymdaqibk/-/any/username/direct/-/?plan_id=13169629 -api-proxy-file 10proxies_download.txt -api-proxy-parallel 10


pause