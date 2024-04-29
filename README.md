FileX permet aux personnels et aux étudiants de transférer des fichiers très volumineux à plusieurs interlocuteurs, même extérieurs à l'établissement (possibilité de protéger le téléchargement avec un mot de passe et de limiter la durée de sa mise à disposition) 

# Comparaison avec FileSender

Renater fournit le logiciel libre [FileSender](https://filesender.org/) : https://filesender.renater.fr/. Nous vous invitons à l'utiliser s'il répond à vos besoins.

Il est parfois nécessaire d'avoir sa propre instance de Filex-NG/FileSender :
* maitriser les quotas et durée max avant expiration (notamment pouvoir faire des dérogations)
* maitriser les logs prouvant une tentative d'upload
* s'assurer que l'utilisateur reçoit toujours un mail à la fin d'un upload
* autoriser l'API à une application

Avantages de Filex-NG :
* simple trusted upload
* anti-virus
* similaire à [FileX](https://github.com/EsupPortail/filex)
* légèreté de Node.js comparé à PHP (?), JavaScript léger et moderne (Vue.js)

Avantages de FileSender :
* large communauté
* encryption de bout en bout
* multi-file upload, TeraSender high speed upload, i18n...

# Fonctionnalités

## Téléversement par l'utilisateur via une page Web

* Téléversement avec barre de progression ([_HTML5 XHR_](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload))
* Reprise du téléversement en cas d'interruption réseau
* L'utilisateur reçoit une notification mail une fois le téléversement terminé

## Téléversement *trusted* à la place de l'utilisteur

Exemple d'utilisation : fournir les numérisations de documents avec une durée de conservation limitée.

## Antivirus, quota, expiration

* Détection antivirus à la fin du téléversement
* Quota par utilisateur
* Expiration au bout d'un certain nombre de jours
* Les administrateurs peuvent configurer des dérogations par utilisateur (quota, durée max avant expiration)

## Sur demande de l'utilisateur

* téléchargement protégé par un mot de passe 
* avis de réception à chaque téléchargement
* récapitulatif des téléchargements à l'expiration du fichier

# Démonstration

L'application installée à l'université Paris 1 Panthéon-Sorbonne est accessible avec authentification Shibboleth via la fédération Education-Recherche Renater :

https://filex-ng.univ-paris1.fr/Shibboleth.sso/Login

# Prérequis

* Node.js
* Mongo database
* MTA (tested with postfix)
* Shibboleth SP

Optional:
* clamav (clamdscan is fast, but requires 1G of RAM)
 
# Installation

```
git clone https://github.com/UnivParis1/filex-ng
cd filex-ng
npm install
```

# Configuration

[conf.js](https://github.com/UnivParis1/filex-ng/blob/master/conf.js)


Si vous utilisez nginx en frontal, n'oubliez de mettre `client_max_body_size 0` pour autoriser les gros uploads (testé  Go

# Démarrage

```
/webhome/filex-ng/www/index.js
```

Voici un script d'init systemd :

```ini /etc/systemd/system/filex-ng.service 
[Unit]
Description=Filex-ng
After=network.target
StartLimitBurst=120
StartLimitIntervalSec=10m

[Service]
RestartSec=5s
SyslogIdentifier=filex-ng
User=filex-ng
PIDFile=/webhome/filex-ng/pid
Environment=PIDFile=/webhome/filex-ng/pid
ExecReload=kill -HUP $MAINPID
ExecStart=/webhome/filex-ng/www/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

# Divers

## Quota utilisé par personne

Personnes ayant utilisées plus de 5G :

```
db.uploads.aggregate([ { $match: { "partial_uploader_file_id": { $exists: false }, deleted: false } }, { $group: { "_id": "$uploader.eppn", count: {$sum: 1}, total_size: {$sum: '$size' } } }  ]).toArray().filter(e => e.total_size > 5e9).map(e => [ e._id, "" + (e.total_size /1e9) + "GB" ])
```

## Derniers gros uploads

```
db.uploads.find({ deleted: false, size: { $gt: 100e6 } }).sort({ uploadTimestamp: -1 }).limit(40).map(e => "" + e.uploadTimestamp.toLocaleString() + ": " + (e.size / 1e6) + "MB " + e.uploader.mail + " " + e.filename)
```

# Licenses

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
