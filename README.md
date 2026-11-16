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

```bash
deno task start
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
