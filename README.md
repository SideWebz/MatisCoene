# Matis Coene

Een kleine Deno + SQLite applicatie met een gescheiden publieke website en backoffice voor Matis Coene.

## Projectstructuur

```text
project/
├── server/
│   ├── server.ts
│   ├── database/
│   │   ├── database.db
│   │   ├── schema.sql
│   │   └── seed.ts
│   ├── auth/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── projects.ts
│   │   └── users.ts
│   └── services/
├── public/
│   └── index.html
├── admin/
│   ├── index.html
│   ├── login.html
│   ├── profile.html
│   ├── projects/
│   │   ├── index.html
│   │   ├── new.html
│   │   └── edit.html
│   ├── users/
│   │   └── index.html
│   ├── css/
│   └── js/
├── uploads/
│   └── projects/
├── deno.json
├── README.md
└── .gitignore
```

## Installatie

1. Zorg dat Deno is geïnstalleerd.
2. Open een terminal in de projectmap.
3. Installeer of controleer afhankelijkheden via Deno.

```bash
deno --version
```

## Database initialiseren

De database wordt automatisch geïnitialiseerd bij het opstarten van de server. De schema-file en seeding worden alleen toegepast als de benodigde tabellen leeg zijn.

```bash
deno task start
```

Als de database nog niet bestaat, wordt deze automatisch aangemaakt.

## Applicatie starten

De serverpoort staat in het `.env`-bestand in de projectroot. De standaardwaarde is `4000`.

Maak `.env` aan op basis van `.env.example` en vul de Gmail SMTP-gegevens in:

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=jouwgmailadres@gmail.com
MAIL_PASSWORD=jouw-google-app-password
MAIL_FROM_ADDRESS=jouwgmailadres@gmail.com
MAIL_FROM_NAME="Matis Coene"
MAIL_TO_ADDRESS=vragen@matiscoene.be
MAIL_AUTO_REPLY_ENABLED=true
TURNSTILE_SITE_KEY=jouw-cloudflare-turnstile-site-key
TURNSTILE_SECRET_KEY=jouw-cloudflare-turnstile-secret-key
TURNSTILE_EXPECTED_HOSTNAMES=matiscoene.be,matiscoene.sidewebz.be
```

Gebruik voor `MAIL_PASSWORD` een Google App Password (niet je gewone Google-wachtwoord) van hetzelfde Google-account als `MAIL_USERNAME`. Spaties uit de gegroepeerde weergave van Google worden automatisch verwijderd. Maak de Turnstile-sleutels aan in Cloudflare en stel beide gebruikte hostnames in bij de widget. De backend accepteert alleen siteverify-antwoorden met `success: true` én een hostname uit `TURNSTILE_EXPECTED_HOSTNAMES`. De site key is publiek; de secret key blijft uitsluitend op de server. `.env` is uitgesloten van Git. Zonder beide Turnstile-sleutels wordt het contactformulier uit veiligheid niet verzonden. De automatische antwoordmail kan daarna ook aan- of uitgezet worden vanuit **Email** in de backoffice; die opgeslagen keuze heeft voorrang op `MAIL_AUTO_REPLY_ENABLED`.

```bash
deno task start
```

De e-mailinstellingentabel wordt automatisch aangemaakt bij het opstarten via het bestaande SQLite-schema. Er is geen handmatige migratie nodig. Installeer op de server de projectbestanden inclusief `deno.lock` en `.env.example`, maak daar een eigen `.env` aan, en voer `deno task start` uit. Controleer de functionaliteit veilig met:

```bash
deno test server/services/email-templates.test.ts
deno task build
```

Open daarna in de browser:

- Publieke site: http://localhost:4000/
- Backoffice: http://localhost:4000/admin/login

## Default login

```text
Username: admin
Password: admin
Role: ADMIN
```

De eerste installatie maakt deze gebruiker automatisch aan als er nog geen gebruikers bestaan.

## Waar uploads worden opgeslagen

Projectfoto's worden opgeslagen in:

```text
/uploads/projects/
```

De applicatie gebruikt veilige, unieke bestandsnamen en valideert bestanden voordat ze worden bewaard.

## Publieke website later toegang geven tot projecten

De publieke site kan later de JSON-endpoint gebruiken om alleen actieve projecten en bijbehorende foto's te ophalen.

```text
GET /api/public/projects
```

De response bevat de projecten in de juiste volgorde, met alle foto's per project.

## Belangrijk

- De seed/init routine overschrijft geen bestaande gebruikers of data.
- Gebruikers kunnen niet bij de backoffice komen zonder geldige sessie.
- Alleen gebruikers met de juiste rol kunnen gebruikers beheren.
- Projectfoto's worden ook fysiek verwijderd wanneer een project of foto wordt verwijderd.
