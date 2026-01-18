title: Never send the users password to the server
files: src/**/*.ts
---

This project is a zero knowledge oauth/oidc project where the users password and the derived private keys are never sent to the server. The users password should never be sent to the server at all, and the private keys should only be sent if they are wrapped/enveloped with a private key the server knows nothing about (i.e. generated on the end users computer only).

Is this file expected or implemented in a way that the users password is sent to the server, either encrypted or not encrypted. Is there and private keys that get sent to the server?
