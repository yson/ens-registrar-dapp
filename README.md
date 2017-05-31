# Ethereum Name Service Registrar DApp(한국어 버전)

This app allows you to register a .eth domain name, for use in ethereum decentralized applications and compatible blockchain browsers.

Check [ens.domains](https://ens.domains/) for more information about the ENS.

Try the app: [registrar.ens.domains](https://registrar.ens.domains/)

### How to run it

    cd app
    meteor npm install
    meteor


### Deploying to github pages

A static copy of the app is kept at [registrar.ens.domains](https://registrar.ens.domains/). The page reflects whatever is kept at the `docs` folder in the `master` branch. So to update the static site, create a working branch and execute these:

```
cd app
meteor-build-client ../docs --path ""
cd ..
git add .
```

Then commit all and make a Pull Request to master.
