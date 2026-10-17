$ErrorActionPreference='Stop'
$lab=Join-Path (Split-Path $PSScriptRoot -Parent) 'server-lab'
if(Test-Path (Join-Path $lab 'localhost.pfx')){throw 'A local PFX already exists; preserve it or choose a separate laboratory directory.'}
$password=[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$cert=Join-Path $lab 'localhost-cert.pem';$key=Join-Path $lab 'localhost-key.pem';$pfx=Join-Path $lab 'localhost.pfx'
& openssl req -x509 -newkey rsa:2048 -nodes -keyout $key -out $cert -days 365 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
if($LASTEXITCODE){throw 'Certificate generation failed'}
$env:NBA_LAB_TLS_PASSWORD=$password
try{& openssl pkcs12 -export -out $pfx -inkey $key -in $cert -passout env:NBA_LAB_TLS_PASSWORD;if($LASTEXITCODE){throw 'PFX export failed'}}finally{Remove-Item Env:NBA_LAB_TLS_PASSWORD}
@{passphrase=$password}|ConvertTo-Json|Set-Content (Join-Path $lab 'tls-local.json')
Write-Host 'Local certificate created. Private certificate/configuration files are ignored by Git.'
